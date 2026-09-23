#!/usr/bin/env bash
# sv — Story Video CLI wrapper. Usage: ./sv help
exec node "$(dirname "$(readlink -f "$0")")/tools/sv.mjs" "$@"
