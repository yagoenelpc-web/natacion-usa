#!/usr/bin/env bash
# Los datos que se actualizan solos van a la rama "datos" (así no se vuelve a publicar la web en Netlify).
#   bajar: trae a web/data/ los últimos datos de la rama
#   subir: guarda web/data/ en la rama
set -euo pipefail
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
case "$1" in
  bajar)
    if git fetch -q origin datos 2>/dev/null; then git checkout origin/datos -- web/data/ && echo "datos traídos de la rama"; fi ;;
  subir)
    tmp=$(mktemp -d)
    cp -r web/data "$tmp/"
    if git fetch -q origin datos 2>/dev/null; then git worktree add -q "$tmp/wt" origin/datos; else git worktree add -q --detach "$tmp/wt" HEAD; fi
    cd "$tmp/wt"
    mkdir -p web/data && cp "$tmp"/data/*.json web/data/
    git add web/data
    if git diff --cached --quiet; then echo "sin cambios"; exit 0; fi
    git commit -q -m "Datos actualizados $(date -u +%F\ %H:%M)"
    for i in 1 2 3; do git push -q origin HEAD:refs/heads/datos && break; sleep 5; git fetch -q origin datos && git rebase -q origin/datos; done
    echo "datos guardados" ;;
esac
