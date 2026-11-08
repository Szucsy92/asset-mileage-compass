import { supabase } from "@/integrations/supabase/client";
import original from "@/assets/fleet-original.xlsx.asset.json";
import type { WorkbookRef } from "./workbookLayout";

export async function saveWorkbookTemplate(file: File, year: number): Promise<WorkbookRef> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Az eredeti forma megőrzéséhez .xlsx fájlt tölts fel.");
  const path = `${year}/${crypto.randomUUID()}.xlsx`;
  const { error } = await supabase.storage.from("fleet-workbooks").upload(path, file, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
  if (error) throw new Error("Az eredeti Excel közös mentése nem sikerült. Az adatok nem változtak.");
  return { path, name: file.name };
}

export async function loadWorkbookTemplate(ref?: WorkbookRef) {
  if (ref) {
    const { data, error } = await supabase.storage.from("fleet-workbooks").download(ref.path);
    if (error || !data) throw new Error("A feltöltött eredeti Excel nem érhető el. Próbáld újra.");
    return data.arrayBuffer();
  }
  const response = await fetch(original.url);
  if (!response.ok) throw new Error("Az eredeti Excel letöltése nem sikerült.");
  return response.arrayBuffer();
}