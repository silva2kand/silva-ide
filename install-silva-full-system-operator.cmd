@echo off
setlocal

set "SRC=%~dp0cowork-os-skills\silva-full-system-operator"
set "DEST=%APPDATA%\cowork-os\skills\silva-full-system-operator"

if not exist "%SRC%\SKILL.md" (
  echo Missing source: %SRC%\SKILL.md
  exit /b 2
)

mkdir "%APPDATA%\cowork-os\skills" >nul 2>&1
mkdir "%DEST%" >nul 2>&1

xcopy "%SRC%\*" "%DEST%\" /E /I /Y >nul

echo Installed to: %DEST%
echo Restart CoWork OS if it is open.
