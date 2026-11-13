/** Ékezet- és elválasztójel-független összehasonlító kulcs */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s\-./·]+/g, "");
