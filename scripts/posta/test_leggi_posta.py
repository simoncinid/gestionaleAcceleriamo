"""Prove del lettore della casella con mail finte. Lancio: python3 -m unittest scripts/posta/test_leggi_posta.py"""
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import leggi_posta as lp  # noqa: E402

CARTELLA = Path(__file__).parent / "fixture"


def eml(nome):
    return (CARTELLA / nome).read_bytes()


class FintoImap:
    """Casella finta: tiene traccia dei comandi per controllare che si legga senza toccare niente."""

    def __init__(self, mail, validita=7):
        self.mail = mail  # {uid: bytes}
        self.validita = validita
        self.comandi = []

    def select(self, cartella, readonly=False):
        self.comandi.append(("SELECT", cartella, readonly))
        return "OK", [str(len(self.mail)).encode()]

    def response(self, codice):
        return codice, [str(self.validita).encode()]

    def uid(self, comando, *arg):
        self.comandi.append((comando,) + arg)
        if comando == "SEARCH":
            if arg[0] == "UID":
                da = int(arg[1].split(":")[0])
                trovati = [u for u in self.mail if u >= da] or [max(self.mail)]  # come IMAP: N:* dà sempre l'ultima
            else:
                trovati = list(self.mail)
            return "OK", [" ".join(str(u) for u in trovati).encode()]
        if comando == "FETCH":
            uid = int(arg[0])
            if "RFC822.SIZE" in arg[1]:
                return "OK", [f"1 (UID {uid} RFC822.SIZE {len(self.mail[uid])})".encode()]
            return "OK", [(f"1 (UID {uid} BODY[] {{{len(self.mail[uid])}}}".encode(), self.mail[uid]), b")"]
        raise AssertionError(comando)


class DaMailAJson(unittest.TestCase):
    def test_invito_google(self):
        j = lp.mail_in_json(eml("invito-google.eml"))
        self.assertEqual(j["messageId"], "<invito-finto-1@google.com>")
        self.assertEqual(j["da"]["email"], "calendar-notification@google.com")
        self.assertTrue(j["oggetto"].startswith("Invito: Acceleriamo x Officina Rossi Finta"))
        self.assertIn("DTSTART;TZID=Europe/Rome:20261105T100000", j["calendario"])
        self.assertIn("giovedì 5 novembre", j["testo"])
        self.assertEqual(j["data"], int(dt.datetime(2026, 10, 26, 15, 0, tzinfo=dt.timezone.utc).timestamp() * 1000))

    def test_modulo_html(self):
        j = lp.mail_in_json(eml("modulo-sito.eml"))
        self.assertEqual(j["rispondiA"], "giulia@carpenteria-neri-finta.it")
        self.assertIsNone(j["calendario"])
        self.assertIn("Nome e cognome\nGiulia Neri", j["testo"])
        self.assertIn("Cosa ti fa perdere più tempo?\nFare i preventivi", j["testo"])
        self.assertIn("1–2", j["testo"])

    def test_risposta(self):
        j = lp.mail_in_json(eml("risposta-lead.eml"))
        self.assertEqual(j["da"], {"email": "mario@officina-rossi-finta.it", "nome": "Mario Rossi"})
        self.assertIn("va bene giovedì", j["testo"])

    def test_senza_message_id(self):
        grezza = b"From: a@b.it\r\nSubject: x\r\n\r\nciao\r\n"
        self.assertTrue(lp.mail_in_json(grezza)["messageId"].startswith("<senza-id-"))


class Giro(unittest.TestCase):
    def setUp(self):
        self.casella = FintoImap({11: eml("invito-google.eml"), 12: eml("modulo-sito.eml"), 13: eml("risposta-lead.eml")})
        self.mandate = []

    def invia(self, j):
        self.mandate.append(j["messageId"])
        return "201"

    def test_primo_giro_poi_solo_le_nuove_in_sola_lettura(self):
        salvati = []
        stato, n = lp.giro(self.casella, self.invia, {}, 14, oggi=dt.date(2026, 10, 26), salva=salvati.append)
        self.assertEqual(n, 3)
        self.assertEqual(stato, {"validita": 7, "ultimo": 13})
        self.assertEqual(salvati[-1], stato)
        self.assertIn(("SEARCH", "SINCE", "12-Oct-2026"), self.casella.comandi)
        # Cartella aperta in sola lettura e corpo letto con PEEK: nessuna mail segnata come letta.
        self.assertEqual(self.casella.comandi[0], ("SELECT", "INBOX", True))
        letture = [c for c in self.casella.comandi if c[0] == "FETCH" and "BODY" in c[2]]
        self.assertTrue(letture and all("BODY.PEEK[]" in c[2] for c in letture))
        self.assertFalse([c for c in self.casella.comandi if c[0] in ("STORE", "COPY", "MOVE", "EXPUNGE")])
        # Secondo giro senza mail nuove: niente mandato (IMAP restituisce comunque l'ultima).
        self.mandate.clear()
        stato2, n2 = lp.giro(self.casella, self.invia, stato, 14)
        self.assertEqual((n2, self.mandate), (0, []))
        self.casella.mail[14] = eml("risposta-lead.eml")
        stato3, n3 = lp.giro(self.casella, self.invia, stato2, 14)
        self.assertEqual((n3, stato3["ultimo"]), (1, 14))

    def test_errore_a_meta_giro_salva_quelle_passate(self):
        salvati = []

        def invia(j):
            if j["messageId"].startswith("<modulo"):
                raise OSError("rete giù")
            return "201"

        with self.assertRaises(OSError):
            lp.giro(self.casella, invia, {}, 14, salva=salvati.append)
        self.assertEqual(salvati[-1]["ultimo"], 11)

    def test_casella_rifatta_riparte_da_capo(self):
        stato, _ = lp.giro(self.casella, self.invia, {"validita": 3, "ultimo": 99}, 14)
        self.assertEqual(stato, {"validita": 7, "ultimo": 13})


class Stato(unittest.TestCase):
    def test_scrivi_e_rileggi(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a" / "stato.json"
            lp.scrivi_stato(p, {"validita": 1, "ultimo": 5})
            self.assertEqual(lp.leggi_stato(p), {"validita": 1, "ultimo": 5})
            self.assertEqual(lp.leggi_stato(Path(d) / "manca.json"), {})


if __name__ == "__main__":
    unittest.main()
