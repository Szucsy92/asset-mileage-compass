# Sprite baking

A kép-sprite-ok (`src/assets/sprites/*.webp`) offline készülnek, a böngésző csak kirajzolja őket.
Nincs hozzá külső 3D-szoftver: egy kis C rasterizáló + Python (numpy, opencv, pillow).

```sh
gcc -O3 -shared -fPIC -o libraster.so raster.c -lm
# forrás-modellek: ../../assets-src/{realistic-shark,clown-fish,beach-ball-free-download}/...
python3 bake_fish.py shark clown     # cápa + 3 bohóchal-színváltozat (8 fázis x 3 kanyar + nyugvó kép)
python3 bake_ball.py                 # strandlabda: 16 gördülés-kép x 2 minta + fény/csillogás réteg
python3 bake_ring_duck.py            # mentőgyűrű (2 szín) + kacsa (16 irány)
python3 bake_boat.py                 # vitorlás (16 irány)
```

A mentőgyűrű, a kacsa és a vitorlás saját, procedurális modell (magasságtérkép + háló), felülnézetből
renderelve; a feltöltött gyűrű- és labda-képek (nem felülnézetiek, beégetett háttérrel) színreferenciaként szolgáltak.
