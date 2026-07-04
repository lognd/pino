.PHONY: install build dev test test-system lint fmt typecheck check types clean

# @playwright/test is EXACT-pinned (no ^) in package.json, matching
# logand.app/frontend's pin -- Playwright ships its own browser binaries
# versioned in lockstep with the npm package; a caret range letting it
# drift even a minor version can silently download mismatched browser
# binaries mid-CI-run and break every system test at once. Pin, upgrade
# deliberately.
install:
	npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm run test

test-system:
	npm run test:system

lint:
	npm run lint

fmt:
	npm run fmt

typecheck:
	npm run typecheck

check: lint typecheck test

types:
	npm run types

clean:
	rm -rf dist node_modules
