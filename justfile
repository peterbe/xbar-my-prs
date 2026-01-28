# https://github.com/casey/just
# https://just.systems/

install:
    bun install

dev:
    bun run dev:my-prs

build:
    bun run build:my-prs

run: build
    out/my-prs

ship: build
    cp out/my-prs ~/Library/Application\ Support/xbar/plugins/my-prs.1m.bin

lintfix:
    bun run lint:fix

format: lintfix

upgrade:
    bun update --interactive
