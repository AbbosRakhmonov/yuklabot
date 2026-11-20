#!/usr/bin/env bash
# Pull-based deploy, run by cron on the server (see crontab line below).
# Deploys the newest master commit once GitHub's "check" job passed for it.
# Nothing connects to the server: it only reads public data from GitHub.
#
#   */2 * * * * /mnt/storage/projects/yuklabot/scripts/deploy.sh >> $HOME/logs/yuklabot_deploy.log 2>&1
#
# Everything runs inside main(), which bash reads in full before running,
# so `git reset` replacing this very file mid-run is harmless.
set -euo pipefail

APP_DIR="/mnt/storage/projects/yuklabot"
REPO="AbbosRakhmonov/yuklabot"

main() {
  # One deploy at a time, even if a build takes longer than the cron interval
  exec 9>/tmp/yuklabot-deploy.lock
  flock -n 9 || exit 0

  # cron has a bare PATH: load nvm (if used) so node, yarn, pm2 are found
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  export PATH="$HOME/.yarn/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

  cd "$APP_DIR"
  git fetch -q origin master
  local current target
  current=$(git rev-parse HEAD)
  target=$(git rev-parse origin/master)
  [ "$current" = "$target" ] && exit 0

  # Only commits whose CI passed; while CI is still running, try again next time
  local result
  result=$(curl -fsS -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/commits/$target/check-runs?check_name=check" \
    | grep -o '"conclusion": *"[a-z_]*"' | head -1 || true)
  case "$result" in
    *success*) ;;
    *) exit 0 ;;
  esac

  echo "$(date '+%F %T') deploying ${target:0:7} (was ${current:0:7})"
  git reset --hard -q "$target"
  yarn install --frozen-lockfile --production=false --silent
  yarn build
  pm2 reload ecosystem.config.js --update-env
  pm2 save >/dev/null
  echo "$(date '+%F %T') deployed ${target:0:7}"
}

main "$@"
