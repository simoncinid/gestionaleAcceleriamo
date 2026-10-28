export default async (page) => {
  const r = await page.evaluate(async () => {
    const { leads } = await (await fetch("/api/leads")).json();
    const aperte = ["da-chiamare-prima-volta","da-richiamare","appuntamento-confermato","in-attesa-preventivo","presentazione-confermata","in-attesa-decisione"];
    const aperti = leads.filter((l) => aperte.includes(l.stageId));
    const senza = aperti.filter((l) => !l.prossima?.azione || l.prossima.scadenza == null).length;
    const per = {};
    for (const l of aperti) per[l.stageId] ??= l.prossima.azione + " | " + (l.prossima.pulsante?.testo ?? "-");
    return { aperti: aperti.length, senzaAzione: senza, per };
  });
  await page.getByText(/Consulenza con /).first().waitFor({ timeout: 5000 });
  return JSON.stringify(r);
};
