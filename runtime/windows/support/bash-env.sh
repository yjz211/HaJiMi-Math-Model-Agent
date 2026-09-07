# Non-interactive shells only. No user shell/profile loading.
python() { "$HAJIMI_PYTHON" "$@"; }
python3() { "$HAJIMI_PYTHON" "$@"; }
export -f python python3
