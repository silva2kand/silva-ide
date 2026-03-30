@echo off
setlocal
set "CCS_DIR=%~dp0.ccs-safe"
call "%APPDATA%\npm\ccs.cmd" %*
