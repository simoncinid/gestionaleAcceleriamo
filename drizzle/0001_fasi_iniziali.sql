INSERT INTO stages (id, label, sort_order, kind, tone) VALUES
  ('da-chiamare-prima-volta', 'Da chiamare prima volta', 10, 'open', 'orange'),
  ('non-chiamato', 'Non chiamato', 20, 'open', 'neutral'),
  ('da-richiamare', 'Da richiamare', 30, 'open', 'yellow'),
  ('appuntamento-confermato', 'Appuntamento confermato', 40, 'open', 'blue'),
  ('presentazione-confermata', 'Presentazione confermata', 50, 'open', 'violet'),
  ('in-attesa-preventivo', 'In attesa preventivo', 60, 'open', 'orange'),
  ('in-attesa-decisione', 'In attesa decisione', 70, 'open', 'yellow'),
  ('probabilmente-bloccato', 'Probabilmente bloccato', 80, 'open', 'neutral'),
  ('chiuso', 'Chiuso', 90, 'won', 'green'),
  ('non-chiuso', 'Non chiuso', 100, 'lost', 'red'),
  ('fuori-target', 'Fuori target', 110, 'lost', 'red'),
  ('fake', 'Fake', 120, 'lost', 'red');
