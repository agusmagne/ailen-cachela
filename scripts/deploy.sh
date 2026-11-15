#!/bin/sh
# Publica el sitio en GitHub Pages (rama gh-pages del remoto origin).
# Uso: npm run deploy
set -e
REMOTE=$(git remote get-url origin)
SITE_URL="${SITE_URL:-https://agusmagne.github.io}" BASE_PATH="${BASE_PATH:-/ailen-cachela}" npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f -q "$REMOTE" gh-pages
rm -rf .git
echo "Publicado en ${SITE_URL:-https://agusmagne.github.io}${BASE_PATH:-/ailen-cachela}/"
