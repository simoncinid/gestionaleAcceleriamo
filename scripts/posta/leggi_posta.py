#!/usr/bin/env python3
"""Lettore della casella tommaso@acceleriamo.it per Acceleriamo OS. Solo lettura.

Legge le mail nuove della Posta in arrivo (IMAP Aruba, cartella aperta in sola lettura: niente
segnato come letto, niente spostato o cancellato) e passa ogni mail, già decodificata, al gestionale
(POST /api/hooks/posta). Lo smistamento (inviti Meet, modulo del sito, risposte dei lead) lo fa il
gestionale. Ricorda l'ultima mail passata in un file di stato, così a ogni giro manda solo le nuove.

Segreti (mai nel codice, mai nei log):
  MAIL_TOMMASO_PASSWORD  password della casella; se manca, dal portachiavi del Mac (servizio acceleriamo-mail-tommaso)
  MAIL_HOOK_KEY          chiave della porta del gestionale; se manca, dal portachiavi (servizio acceleriamo-mail-hook)
Altre impostazioni (facoltative):
  MAIL_UTENTE (tommaso@acceleriamo.it), MAIL_SERVER (imaps.aruba.it), MAIL_PORTA (993),
  APP_URL (https://risorse.acceleriamo.it), MAIL_STATO (~/.local/state/acceleriamo-posta/stato.json),
  MAIL_GIORNI_INIZIALI (14: al primo giro si leggono solo le mail degli ultimi 14 giorni)

Uso:
  python3 leggi_posta.py            un giro: legge e manda le mail nuove
  python3 leggi_posta.py --mostra   un giro di prova: legge e stampa mittente e oggetto, non manda niente e non avanza
  python3 leggi_posta.py --file a.eml [b.eml]   stampa il JSON che verrebbe mandato per mail salvate su file
"""
import datetime as dt
import email
import email.policy
import email.utils
import hashlib
import html
import imaplib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

MAX_TESTO = 40_000
MAX_CALENDARIO = 100_000
MAX_SCARICO = 10 * 1024 * 1024  # oltre questa dimensione si legge solo l'intestazione (allegati pesanti)


def log(msg):
    print(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}", flush=True)


def segreto(variabile, servizio):
    v = os.environ.get(variabile)
    if v:
        return v
    if sys.platform == "darwin":
        r = subprocess.run(["security", "find-generic-password", "-s", servizio, "-w"], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    return None


# --- Da mail grezza a JSON ---

def html_in_testo(h):
    h = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>|</h\d>", "\n", h)
    h = re.sub(r"(?i)</td>|</th>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    h = html.unescape(h)
    righe = [re.sub(r"[ \t\xa0]+", " ", r).strip() for r in h.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(righe)).strip()


def _contenuto(parte):
    try:
        return parte.get_content()
    except (LookupError, UnicodeDecodeError, KeyError):
        dati = parte.get_payload(decode=True) or b""
        return dati.decode(parte.get_content_charset() or "utf-8", errors="replace")


def mail_in_json(grezza):
    m = email.message_from_bytes(grezza, policy=email.policy.default)
    mid = (m.get("Message-ID") or "").strip()
    if not mid:
        mid = "<senza-id-" + hashlib.sha256(grezza).hexdigest()[:32] + ">"
    try:
        data = int(email.utils.parsedate_to_datetime(m.get("Date")).timestamp() * 1000)
    except (TypeError, ValueError, IndexError):
        data = int(dt.datetime.now().timestamp() * 1000)
    nome, indirizzo = email.utils.parseaddr(str(m.get("From") or ""))
    _, rispondi = email.utils.parseaddr(str(m.get("Reply-To") or ""))

    testo, calendario = "", None
    corpo = m.get_body(preferencelist=("plain", "html")) if m.is_multipart() or m.get_content_maintype() == "text" else None
    if corpo is not None:
        testo = _contenuto(corpo)
        if corpo.get_content_subtype() == "html":
            testo = html_in_testo(testo)
    for parte in m.walk():
        tipo = parte.get_content_type()
        nomefile = (parte.get_filename() or "").lower()
        if calendario is None and (tipo == "text/calendar" or tipo == "application/ics" or nomefile.endswith(".ics")):
            c = _contenuto(parte)
            calendario = c.decode("utf-8", errors="replace") if isinstance(c, bytes) else c
    return {
        "messageId": mid[:500],
        "data": data,
        "da": {"email": indirizzo.lower(), "nome": nome or None},
        "rispondiA": rispondi.lower() or None,
        "oggetto": str(m.get("Subject") or "")[:1000],
        "testo": (testo or "")[:MAX_TESTO],
        "calendario": calendario[:MAX_CALENDARIO] if calendario else None,
    }


# --- Stato del giro ---

def leggi_stato(percorso):
    try:
        return json.loads(Path(percorso).read_text())
    except (OSError, ValueError):
        return {}


def scrivi_stato(percorso, stato):
    p = Path(percorso)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(stato))
    tmp.replace(p)


# --- Invio al gestionale ---

class ChiaveRifiutata(Exception):
    pass


def manda(app_url, chiave, corpo):
    """Ritorna (stato_http, risposta). Errori di rete e 5xx: eccezione (si riprova al giro dopo)."""
    req = urllib.request.Request(
        app_url.rstrip("/") + "/api/hooks/posta",
        data=json.dumps(corpo).encode("utf-8"),
        headers={"content-type": "application/json", "authorization": f"Bearer {chiave}", "user-agent": "acceleriamo-posta/1"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise ChiaveRifiutata("il gestionale rifiuta la chiave (MAIL_HOOK_KEY)")
        if 400 <= e.code < 500:
            return e.code, {}
        raise


# --- Giro ---

def giro(imap, invia, stato, giorni_iniziali=14, oggi=None, salva=None):
    """Legge le mail nuove dalla Posta in arrivo in sola lettura e le passa a invia(json) una per una.
    Dopo ogni mail consegnata chiama salva(stato). Un errore di invio ferma il giro: la mail si riprova al giro dopo.
    Ritorna (stato nuovo, numero di mail passate)."""
    tipo, dati = imap.select("INBOX", readonly=True)
    if tipo != "OK":
        raise RuntimeError("cartella Posta in arrivo non apribile")
    risposta = imap.response("UIDVALIDITY")[1]
    validita = int(risposta[0]) if risposta and risposta[0] else 0
    if stato.get("validita") != validita:
        stato = {"validita": validita, "ultimo": 0}
        da = (oggi or dt.date.today()) - dt.timedelta(days=giorni_iniziali)
        # IMAP vuole il mese in inglese, qualunque sia la lingua del computer.
        mesi = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        criterio = ("SINCE", f"{da.day:02d}-{mesi[da.month - 1]}-{da.year}")
    else:
        criterio = ("UID", f"{stato['ultimo'] + 1}:*")
    tipo, dati = imap.uid("SEARCH", *criterio)
    uids = sorted(int(u) for u in (dati[0] or b"").split())
    # "N:*" restituisce sempre l'ultima mail anche se è già passata: si tengono solo le nuove.
    uids = [u for u in uids if u > stato["ultimo"]]
    passate = 0
    for uid in uids:
        tipo, dati = imap.uid("FETCH", str(uid), "(RFC822.SIZE)")
        dim = int(re.search(rb"RFC822\.SIZE (\d+)", dati[0] if isinstance(dati[0], bytes) else dati[0][0]).group(1)) if dati and dati[0] else 0
        sezione = "BODY.PEEK[HEADER]" if dim > MAX_SCARICO else "BODY.PEEK[]"
        tipo, dati = imap.uid("FETCH", str(uid), f"({sezione})")
        grezza = next((x[1] for x in dati if isinstance(x, tuple)), None)
        if grezza is None:
            log(f"mail {uid}: contenuto non letto, saltata")
        else:
            esito = invia(mail_in_json(grezza))
            log(f"mail {uid}: {esito}")
        stato = {"validita": validita, "ultimo": uid}
        passate += 1
        if salva:
            salva(stato)
    return stato, passate


def main(argv):
    if argv[1:2] == ["--file"]:
        for f in argv[2:]:
            print(json.dumps(mail_in_json(Path(f).read_bytes()), ensure_ascii=False, indent=2))
        return 0
    prova = "--mostra" in argv
    utente = os.environ.get("MAIL_UTENTE", "tommaso@acceleriamo.it")
    server = os.environ.get("MAIL_SERVER", "imaps.aruba.it")
    porta = int(os.environ.get("MAIL_PORTA", "993"))
    app_url = os.environ.get("APP_URL", "https://risorse.acceleriamo.it")
    percorso = os.environ.get("MAIL_STATO", str(Path.home() / ".local/state/acceleriamo-posta/stato.json"))
    giorni = int(os.environ.get("MAIL_GIORNI_INIZIALI", "14"))
    password = segreto("MAIL_TOMMASO_PASSWORD", "acceleriamo-mail-tommaso")
    chiave = None if prova else segreto("MAIL_HOOK_KEY", "acceleriamo-mail-hook")
    if not password:
        log("manca la password della casella (MAIL_TOMMASO_PASSWORD o portachiavi acceleriamo-mail-tommaso): niente da fare")
        return 2
    if not prova and not chiave:
        log("manca la chiave del gestionale (MAIL_HOOK_KEY o portachiavi acceleriamo-mail-hook): niente da fare")
        return 2

    def invia(corpo):
        if prova:
            return f"[prova] da {corpo['da']['email']}, oggetto {corpo['oggetto'][:60]!r}, calendario {'sì' if corpo['calendario'] else 'no'}"
        codice, r = manda(app_url, chiave, corpo)
        return f"{codice} {r.get('tipo', '')} {r.get('esito', '')}".strip()

    stato = leggi_stato(percorso)
    imap = imaplib.IMAP4_SSL(server, porta, timeout=60)
    try:
        imap.login(utente, password)
        _, passate = giro(imap, invia, stato, giorni, salva=None if prova else (lambda s: scrivi_stato(percorso, s)))
    except ChiaveRifiutata as e:
        log(f"fermo: {e}")
        return 3
    except (OSError, urllib.error.URLError) as e:
        log(f"giro interrotto, si riprova al prossimo: {type(e).__name__}")
        return 1
    except imaplib.IMAP4.error:
        log("accesso alla casella rifiutato: controllare utente e password")
        return 3
    finally:
        try:
            imap.logout()
        except Exception:
            pass
    log(f"giro finito: {passate} mail{' (prova, stato non salvato)' if prova else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
