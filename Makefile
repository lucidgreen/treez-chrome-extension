.DEFAULT_GOAL := dist

VERSION := $$(jq -r '.version' manifest.json)
OUTPUT_FILE := dist/lucidretail-treez-$(VERSION).zip

clean:
	@echo Cleaning
	@rm -rf dist/*

.PHONY: dist
dist: clean
	@echo Making $(OUTPUT_FILE)...
	@zip -qr $(OUTPUT_FILE) media background.js manifest.json popup.html popup.js rules.json
