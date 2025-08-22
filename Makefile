APP_DIR ?= /root/apps/ruserbot
CONTAINER ?= ruserbot
IMAGE ?= ruserbot:latest
ENV_FILE ?= .env.prod
SERVICE ?= ruserbot-deploy.service
TIMER ?= ruserbot-deploy.timer

ifeq ($(shell id -u),0)
SUDO :=
else
SUDO := sudo
endif

TOKEN := $(shell grep -E '^TELEGRAM_BOT_TOKEN=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-)

.PHONY: help env-check build run start stop restart rm logs ps \
        deploy deploy-force git-pull webhook-delete \
        enable-timer disable-timer timer-status timer-next service-run service-logs \
        prune

help:
	@echo "Команды:"
	@echo "  make build           - docker build -t $(IMAGE) ."
	@echo "  make run             - пересоздать и запустить контейнер ($(CONTAINER))"
	@echo "  make start/stop/restart/rm - управление контейнером"
	@echo "  make logs            - логи контейнера (Ctrl+C чтоб выйти)"
	@echo "  make ps              - показать состояние контейнера"
	@echo "  make deploy          - ./deploy.sh (деплой, если есть новые коммиты)"
	@echo "  make deploy-force    - ./deploy.sh force (форс-пересборка + рестарт)"
	@echo "  make git-pull        - git pull"
	@echo "  make webhook-delete  - удалить webhook (мы на long-polling)"
	@echo "  make enable-timer    - включить ежедневный автодеплой"
	@echo "  make disable-timer   - выключить автодеплой"
	@echo "  make timer-status    - статус таймера"
	@echo "  make timer-next      - следующее срабатывание таймера"
	@echo "  make service-run     - разово запустить деплой-сервис"
	@echo "  make service-logs    - логи деплой-сервиса"
	@echo "  make prune           - подчистить висячие образы"

env-check:
	@test -f $(ENV_FILE) || (echo "❌ Нет $(ENV_FILE)"; exit 1)
	@grep -q '^TELEGRAM_BOT_TOKEN=' $(ENV_FILE) || (echo "❌ Заполни TELEGRAM_BOT_TOKEN в $(ENV_FILE)"; exit 1)
	@echo "✅ Ок: $(ENV_FILE) найден"

build: env-check
	docker build -t $(IMAGE) .

run: env-check
	- docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d --name $(CONTAINER) \
	  --restart always \
	  --env-file $(ENV_FILE) \
	  --log-opt max-size=10m --log-opt max-file=3 \
	  $(IMAGE)

start:
	docker start $(CONTAINER)

stop:
	docker stop $(CONTAINER)

restart:
	docker restart $(CONTAINER)

rm:
	- docker rm -f $(CONTAINER) 2>/dev/null || true

logs:
	docker logs -f $(CONTAINER)

ps:
	docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" | grep -E "^$(CONTAINER)\b" || echo "нет контейнера $(CONTAINER)"

deploy: env-check
	cd $(APP_DIR) && ./deploy.sh

deploy-force: env-check
	cd $(APP_DIR) && ./deploy.sh force

git-pull:
	cd $(APP_DIR) && git pull

webhook-delete: env-check
	@test -n "$(TOKEN)" || (echo "❌ Не найден TELEGRAM_BOT_TOKEN в $(ENV_FILE)"; exit 1)
	curl -s "https://api.telegram.org/bot$(TOKEN)/deleteWebhook" >/dev/null && echo "✅ Webhook удалён"

enable-timer:
	$(SUDO) systemctl daemon-reload
	$(SUDO) systemctl enable --now $(TIMER)

disable-timer:
	- $(SUDO) systemctl disable --now $(TIMER) || true

timer-status:
	$(SUDO) systemctl status $(TIMER)

timer-next:
	systemctl list-timers --all | grep $(TIMER) || true

service-run:
	$(SUDO) systemctl start $(SERVICE)

service-logs:
	journalctl -u $(SERVICE) -n 100 --no-pager

prune:
	docker image prune -f
