#!/usr/bin/env bash
#
# backup-db.sh — Backup automático do banco PostgreSQL do Supabase.
#
# Gera um dump comprimido (formato custom do pg_dump, restaurável com pg_restore),
# guarda numa pasta local e remove backups mais antigos que RETENTION_DAYS.
#
# Configuração: copie scripts/.backup.env.example para scripts/.backup.env
# e preencha a CONNECTION STRING. Esse arquivo .backup.env NÃO vai para o Git.
#
# Uso manual:   ./scripts/backup-db.sh
# Uso agendado: ver instruções de cron no final deste arquivo.

set -euo pipefail

# --- Localizar a pasta do script (funciona mesmo chamado de outro diretório) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.backup.env"

# --- Carregar configuração ---
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERRO: arquivo de configuração não encontrado: ${ENV_FILE}" >&2
  echo "      Copie scripts/.backup.env.example para scripts/.backup.env e preencha." >&2
  exit 1
fi
# shellcheck source=/dev/null
set -a; source "${ENV_FILE}"; set +a

BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# A conexão é montada por campos separados (DB_HOST/DB_USER/DB_PASSWORD/...).
# Assim, senhas com caracteres especiais (@ # $ etc.) funcionam sem precisar
# de URL-encoding. A senha vai via PGPASSWORD, nunca na linha de comando.
: "${DB_HOST:?Defina DB_HOST no arquivo .backup.env}"
: "${DB_USER:?Defina DB_USER no arquivo .backup.env}"
: "${DB_PASSWORD:?Defina DB_PASSWORD no arquivo .backup.env}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-postgres}"
export PGPASSWORD="${DB_PASSWORD}"

# --- Pré-requisitos ---
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERRO: pg_dump não encontrado. Instale com: brew install libpq && brew link --force libpq" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${BACKUP_DIR}/supabase_${TIMESTAMP}.dump"
LOGFILE="${BACKUP_DIR}/backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOGFILE}"; }

log "Iniciando backup -> ${OUTFILE}"

# -Fc  = formato custom (comprimido, restaurável seletivamente com pg_restore)
# --no-owner / --no-privileges = restauração mais portável para outro servidor
# Schemas internos de infra do Supabase são excluídos; seus dados (public, auth,
# storage) são preservados. Ajuste os --exclude-schema se precisar.
if pg_dump \
      --host="${DB_HOST}" \
      --port="${DB_PORT}" \
      --username="${DB_USER}" \
      --dbname="${DB_NAME}" \
      --format=custom \
      --no-owner \
      --no-privileges \
      --exclude-schema='pgbouncer' \
      --exclude-schema='supabase_functions' \
      --exclude-schema='_realtime' \
      --exclude-schema='realtime' \
      --file="${OUTFILE}" 2>>"${LOGFILE}"; then
  SIZE="$(du -h "${OUTFILE}" | cut -f1)"
  log "OK: backup concluído (${SIZE})"
else
  log "FALHA: pg_dump retornou erro. Veja o log acima."
  rm -f "${OUTFILE}"
  exit 1
fi

# --- Rotação: apaga dumps mais antigos que RETENTION_DAYS ---
DELETED="$(find "${BACKUP_DIR}" -name 'supabase_*.dump' -type f -mtime +"${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
log "Rotação: ${DELETED} backup(s) antigo(s) removido(s) (retenção: ${RETENTION_DAYS} dias)"

log "Concluído."

# -----------------------------------------------------------------------------
# AGENDAR AUTOMATICAMENTE (cron, todo dia às 3h da manhã):
#
#   crontab -e
#
# e adicione a linha (ajuste o caminho absoluto):
#
#   0 3 * * * /Applications/Claude\ Trabalho/lovable-qr-tickets/scripts/backup-db.sh >> /Applications/Claude\ Trabalho/lovable-qr-tickets/backups/cron.log 2>&1
#
# RESTAURAR um backup em outro Postgres:
#
#   pg_restore --no-owner --no-privileges --dbname="$DB_URL_DESTINO" caminho/do/arquivo.dump
# -----------------------------------------------------------------------------
