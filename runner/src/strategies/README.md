# Canonical strategy definitions

`pulse.json`, `red.json`, and `drift.json` are the canonical V1 strategy commitments registered in `AgentRegistry`. Each `strategyHash` is Keccak-256 of the file's exact committed bytes, including whitespace and the final LF newline. The hash commits to the strategy definition; it does not prove that the trusted V1 runner executed it faithfully.

The files use UTF-8, two-space JSON indentation and LF line endings. Do not reformat one casually: any byte change intentionally produces a new strategy hash and therefore requires a new agent registration rather than mutating an existing identity.

| Agent | Model version | Canonical file | `strategyHash` |
| --- | --- | --- | --- |
| Pulse | `pulse-v1.2` | `pulse.json` | `0x8d32353838e901b918e9d1fb1d50c19fe0ac35a9dbe82da1b3c755033c91d0c3` |
| Red | `red-v1.0` | `red.json` | `0xacbf6fccaf5e4c5dad8c8cc2d66c13cd3cfe57b9070cea12262b2d09efe869f9` |
| Drift | `drift-v1.0` | `drift.json` | `0xe394056ed936fd2705b87058e1c331ba6fac94d5e090505f3753bfbc096aa573` |

From the repository root, reproduce a hash with:

```bash
cast keccak "0x$(xxd -p -c 0 runner/src/strategies/pulse.json)"
```

The Foundry `StrategyDefinitionsTest` hashes the same exact bytes and locks all three expected values. The deployment script reads these files directly and must register the returned hashes instead of maintaining a second set of constants.
