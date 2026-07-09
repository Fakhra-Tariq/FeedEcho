@echo off
cd /d "c:\Users\Dell\Desktop\FeedEcho-main\server\routes"
powershell -Command "(Get-Content spaceRaces.js) -replace 'const numberOfTeams = race\.settings\?\.numberOfTeams || 2;', 'const assignedTeamId = 1;'" | Set-Content spaceRaces.js
echo Fixed team assignment logic
