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
    mkdir -p web/data && cp -r "$tmp"/data/. web/data/
    # Ficheros que guardan sus propios procesos (con subir-uno): aquí se dejan como están en la rama.
    for f in records.json internacionales.json escudos.json enlaces.json; do git checkout -q origin/datos -- "web/data/$f" 2>/dev/null || true; done
    git add web/data
    if git diff --cached --quiet; then echo "sin cambios"; exit 0; fi
    git commit -q -m "Datos actualizados $(date -u +%F\ %H:%M)"
    for i in 1 2 3; do git push -q origin HEAD:refs/heads/datos && break; sleep 5; git fetch -q origin datos && git rebase -q -X ours origin/datos; done
    echo "datos guardados" ;;
  subir-uno)
    f="$2"; tmp=$(mktemp -d); cp "$f" "$tmp/f"
    for i in 1 2 3 4 5; do
      git fetch -q origin datos
      rm -rf "$tmp/wt"; git worktree prune; git worktree add -q "$tmp/wt" origin/datos
      (cd "$tmp/wt" && mkdir -p "$(dirname "$f")" && cp "$tmp/f" "$f" && git add "$f" && { git diff --cached --quiet && echo "sin cambios" && exit 0; git commit -q -m "Datos: $(basename "$f") $(date -u +%F\ %H:%M)" && git push -q origin HEAD:refs/heads/datos; }) && { echo "guardado $f"; exit 0; }
      sleep 10
    done
    exit 1 ;;
esac
