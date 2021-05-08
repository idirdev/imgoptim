# imgoptim

> **[EN]** Audit images in any project directory — report sizes, dimensions, formats, and estimate potential savings from converting to modern formats like WebP.
> **[FR]** Auditez les images de tout répertoire de projet — rapportez les tailles, dimensions, formats et estimez les économies potentielles en convertissant vers des formats modernes comme WebP.

---

## Features / Fonctionnalités

**[EN]**
- Supports PNG, JPG/JPEG, GIF, WebP, AVIF, SVG, BMP, ICO
- Reads actual pixel dimensions from PNG and JPEG binary headers (no native bindings)
- Sorts results by file size (largest first) to surface the biggest wins
- Detects already-optimal formats (WebP, AVIF) and skips them
- Estimates ~40% size savings for images that could be converted to WebP
- Aggregates a summary: total count, total size, total potential savings, breakdown by extension
- Outputs a concise human-readable report or full JSON with `--json`
- Recursively scans directories, skipping `node_modules` and `.git`

**[FR]**
- Prend en charge PNG, JPG/JPEG, GIF, WebP, AVIF, SVG, BMP, ICO
- Lit les dimensions réelles en pixels depuis les en-têtes binaires PNG et JPEG (sans liaisons natives)
- Trie les résultats par taille (les plus grands en premier) pour identifier les gains les plus importants
- Détecte les formats déjà optimaux (WebP, AVIF) et les ignore
- Estime ~40% d'économies de taille pour les images convertibles en WebP
- Agrège un résumé : nombre total, taille totale, économies potentielles totales, répartition par extension
- Sortie en rapport lisible concis ou JSON complet avec `--json`
- Scanne récursivement les répertoires en ignorant `node_modules` et `.git`

---

## Installation

```bash
npm install -g @idirdev/imgoptim
```

---

## CLI Usage / Utilisation CLI

```bash
# Scan current directory (scanner le répertoire courant)
imgoptim

# Scan a specific directory (scanner un répertoire spécifique)
imgoptim ./public/images

# Output full JSON report (sortie JSON complète)
imgoptim ./assets --json

# Show help (afficher l'aide)
imgoptim --help
```

### Example Output / Exemple de sortie

```
$ imgoptim ./public
12 images (4.21MB):
  hero-banner.png 1.42MB 1920x1080 -> .webp
  about-photo.jpg 892.3KB 1200x800 -> .webp
  team.jpg 634.1KB 800x600 -> .webp
  logo.svg 12.4KB SVG (minify)
  icon-check.png 8.2KB 32x32 -> .webp
  favicon.ico 4.3KB
  thumbnail.webp 76.5KB
  bg-pattern.png 218.7KB 512x512 -> .webp

Potential savings: 1.69MB
```

---

## API (Programmatic) / API (Programmation)

```js
const { analyzeImage, scanDir, summary, formatSize } = require('@idirdev/imgoptim');

// Analyze a single image file (analyser un fichier image unique)
const img = analyzeImage('./public/hero.png');
console.log(img.sizeStr);        // '1.42MB'
console.log(img.width);          // 1920
console.log(img.height);         // 1080
console.log(img.canOptimize);    // true
console.log(img.suggestedFormat); // '.webp'
console.log(img.savingsStr);     // '581.4KB'

// Scan an entire directory tree (scanner un arbre de répertoires entier)
const results = scanDir('./public');
// sorted by size descending (triés par taille décroissante)

// Get aggregate summary (obtenir le résumé agrégé)
const s = summary(results);
console.log(s.count);           // 12
console.log(s.totalSizeStr);    // '4.21MB'
console.log(s.totalSavingsStr); // '1.69MB'
console.log(s.byType);          // { '.png': 4, '.jpg': 3, '.webp': 2, ... }

// Format byte counts (formater des octets)
console.log(formatSize(1572864)); // '1.50MB'
```

---

## License

MIT © idirdev
