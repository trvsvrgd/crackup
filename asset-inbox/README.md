# Drop new assets here

Put each downloaded pack in its own folder under **`asset-inbox/packages/`**.
This location is available to Codex in this workspace. Raw downloads and generated
indexes are Git-ignored; reviewed runtime assets are promoted separately.

1. Create a folder such as `packages/mixamo-combat/` or `packages/scifi-guns/`.
2. Keep the original ZIP/FBX/GLB/WAV files and their license. Preserve original
   filenames. You may also extract a pack into an `extracted/` subfolder.
3. Copy [metadata.template.json](metadata.template.json) into that folder as
   `asset.json`. Fill in the source page, creator, intended use and saved license
   filename. Leave uncertain rights as `null` for review. Keep purchase receipts
   outside this folder because they can contain personal/payment information.
4. Run `npm run assets:intake` from the project root, or ask Codex to run it.
5. Tell Codex which package to integrate and where it belongs in the game.

Read the [sourcing guide](../docs/ASSET_ACQUISITION_GUIDE.md) first. For a useful
first batch, get combat animation, modular guns, selected sci-fi props and sound.

Example local layout (this describes folders to create, not supplied assets):

```text
asset-inbox/
  packages/
    your-pack-id/
      asset.json
      LICENSE.txt
      original-download.zip
      extracted/
```

The index lists actual files, byte counts, SHA-256 hashes and basic model/image
metadata. It does not download, extract, execute, convert, license-approve or
publish anything. A package marked `needs-review` has not passed game integration.
Unexpanded archives remain `archive-needs-extraction`.

Files on your PC are available to a local Codex run with access to this workspace.
A separate cloud checkout will need its own private transfer of permitted assets;
these ignored folders do not arrive through `git clone`.

Installed locally: `packages/mixamo-capoeira/` preserves the original Capoeira
ZIP, its extraction and source hashes. Rebuild the 39-clip runtime library with
`npm run assets:capoeira`; inspect it with `npm run assets:preview`. Further
compatible Mixamo downloads should use the same **Y Bot** source character.

Suggested handoff after you have copied files:

> Read docs/ASSET_ACQUISITION_GUIDE.md and asset-inbox/README.md. Run assets:intake.
> Integrate package YOUR-PACK-ID into the Neon Docks opening operation. Review
> its license and inspect its actual contents, preserve procedural fallbacks and
> authoritative collision/combat timing, implement the required adapters, then
> verify model bindings, rendering, disposal and performance. Report any missing
> source files or permissions before promoting the package to public/assets.

The old Mixamo build expects its seven named FBXs in
`.cache/prod-assets/mixamo/`. Codex can copy the reviewed real FBXs there from this
inbox; the indexer does not perform that conversion automatically.
