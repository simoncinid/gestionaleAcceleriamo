# Registro della corsia A (regole nel worker)

Silvio (sviluppatore), ramo `blocco1-corsia-a`, anteprima sulla porta 5211.

| Modifica | Commit | Esito | Cosa resta | Ruling |
|---|---|---|---|---|
| 3 No-show | vedi `git log` ("blocco 1, modifica 3") | Fatto. Evento `no_show` in `transizione`; rotta POST `/api/leads/:id/no-show` `{kind}`; la call "saltata" di `aggiornaCall` passa dalla stessa regola (solo se il lead è nella fase della call); fine pausa in `worker/avvisi/controlli.ts` conserva "Riprovare"; in 30/50 con 2 assenze, finita la pausa, una chiamata a vuoto porta in 80 motivo `no_show`. Prove `tests/b1a-no-show.test.ts` (10) verdi; due prove vecchie aggiornate al contratto (`regole-motore`, `calls`). Anteprima: demo-lead-17 in 30, prima volta "Rifissare la consulenza", stato oggi, fase invariata; seconda "Riprovare il lunedì 28 dicembre". | WhatsApp "ci siamo persi?" non costruito. | Ruling: il WhatsApp al cliente non parte e non si prepara in automatico (nessun invio senza sì); resta il pulsante WhatsApp della scheda. Costo se sbagliato: basso, si aggiunge una bozza dal modello quando Tommaso lo chiede. Ruling: toccato `worker/avvisi/controlli.ts` (una riga SQL della fine pausa), file non in elenco ma indicato dall'ordine. |
