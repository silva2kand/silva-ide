@echo off
setlocal

set "ROOT=%~dp0"
set "SRCROOT=%ROOT%cowork-os-skills"
set "DESTROOT=%APPDATA%\cowork-os\skills"

mkdir "%DESTROOT%" >nul 2>&1

set SKILLS=silva-mission-control silva-deep-research silva-full-system-operator silva-council-mode silva-safety-governor silva-pc-operator silva-browser-agent silva-file-docs-agent silva-email-agent silva-voice-pipeline silva-memory-vault silva-uk-legal silva-accounting silva-devops silva-pm-vault silva-cctv-ops silva-pos-watch silva-vision-lab silva-audio-studio silva-content-studio silva-local-model-switchboard research-last-days

for %%S in (%SKILLS%) do (
  if not exist "%SRCROOT%\%%S.json" (
    echo Missing source: %SRCROOT%\%%S.json
    exit /b 2
  )
  copy /Y "%SRCROOT%\%%S.json" "%DESTROOT%\%%S.json" >nul
  if exist "%SRCROOT%\%%S\SKILL.md" (
    mkdir "%DESTROOT%\%%S" >nul 2>&1
    xcopy "%SRCROOT%\%%S\*" "%DESTROOT%\%%S\" /E /I /Y >nul
  )
  echo Installed: %%S
)

echo.
echo Installed to: %DESTROOT%
echo Restart CoWork OS if it is open.
