// Modifica 5: aspetta che la tabella mostri i lead demo e conta le righe con il nome di un'azienda demo.
export default async (page) => {
  await page.getByText("Officina Bullonetti").first().waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForTimeout(800);
  const nomi = ["Officina Bullonetti", "Casa Tegolina", "Studio Partitadoppia", "Elettro Impianti Voltolini", "Trasporti Pacchettoni",
    "Studio Dentistico Molarini", "Immobiliare Mattonelli", "Autofficina Pistonfino", "Spedizioni Nastrino", "Francesca Moretti"];
  const visti = [];
  for (const n of nomi) if (await page.getByText(n).count()) visti.push(n);
  const collaudo = await page.getByText(/^Collaudo/).count();
  return `aziende demo visibili ${visti.length} di ${nomi.length}, righe "Collaudo" ${collaudo}`;
};
