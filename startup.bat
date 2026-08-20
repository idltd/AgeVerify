@echo off
cd /d "%~dp0"
start "AgeVerify Root (4000)" cmd /k node server\root.js
start "AgeVerify Voucher Site (4001)" cmd /k node server\voucher-site.js
start "AgeVerify Bouncer Site (4002)" cmd /k node server\bouncer-site.js
echo Root:     http://localhost:4000
echo Voucher:  http://localhost:4001
echo Bouncer:  http://localhost:4002
