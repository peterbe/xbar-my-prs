# https://github.com/casey/just
# https://just.systems/

install:
    bun install

dev:
    bun run dev

build:
    bun run build

run: build
    out/my-prs

ship: build
    cp out/my-prs ~/Library/Application\ Support/xbar/plugins/my-prs.1m.bin

lintfix:
    bun run lint:fix

format: lintfix

upgrade:
    bun update --interactive
