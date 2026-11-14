# Sprites

Előre renderelt, felülnézeti sprite-ok (orr / orrfék a +x irányban). Lásd `tools/sprites/` a generálásukhoz.

| Fájl | Tartalom |
| --- | --- |
| `shark.webp`, `koi.webp`, `tang.webp`, `perch.webp` | hal-lapok: 8 farokcsapás-fázis × 3 kanyar-szint (dőlve) + 1 nyugvó kép |
| `ball0.webp`, `ball1.webp` | strandlabda, 16 gördülés-kép egy sorban |
| `ball_shade.webp` | labda fény-/csillogásréteg `[árnyék \| csillogás]` |
| `ring0.webp`, `ring1.webp` | mentőgyűrű (narancs, kék) |
| `duck.webp`, `boat.webp` | 16 irányú kép, 8 oszlop × 2 sor |

## Források és jogok

- **Strandlabda** – "Beach Ball (Free Download)", Tommyleenev, [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/) – https://sketchfab.com/3d-models/beach-ball-free-download-c915a99e9bae4dbe8dd7be3215e19ba0 (a hálót és a textúrát felülnézetből renderelve használtuk; a második minta ugyanaz a háló rózsaszín/kék palettával).
- **Cápa** ("Realistic Shark") és **bohóchal** ("Fish_001"): a feltöltött modellek, felülnézetből renderelve; a bohóchal három színváltozata a textúra átszínezésével készült. A modellek licencét ellenőrizd a forrásoldalukon, mielőtt kiadod az appot.
- **Mentőgyűrű, kacsa, vitorlás**: saját modell. A feltöltött mentőgyűrű- és rózsaszín-kék labda-renderek csak színreferenciák voltak, pixelt nem vettünk át belőlük.
