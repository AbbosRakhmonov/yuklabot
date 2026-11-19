#!/bin/bash
set -e

echo "1. Nginx konfiguratsiyasi ko'chirilmoqda..."
cp /mnt/storage/projects/yuklabot/nginx-rakhmonov.uz.conf /etc/nginx/sites-available/rakhmonov.uz

echo "2. Nginx sintaksisi tekshirilmoqda..."
nginx -t

echo "3. Nginx qayta ishga tushirilmoqda..."
systemctl restart nginx

echo ""
echo "✅ Bajarildi! https://rakhmonov.uz/admin tayyor!"
