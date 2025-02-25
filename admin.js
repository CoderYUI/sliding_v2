import { db, realtimeDb } from './firebase-config.js';
import { firebaseConnection } from './firebaseConnection.js';

// Your existing code...
import { collection, getDocs, doc, setDoc, query, onSnapshot, writeBatch, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, onValue, set, get } from 'firebase/database';

class AdminPanel {
    constructor() {
        this.intervals = [];
        this.listeners = [];
        this.setupEventListeners();
        this.setupAllRealtimeListeners();
        this.setupRegistrationControls();
        this.setupRegistrationListener(); // Changed from listenToRegistrationState
        this.getCurrentPuzzle();
        this.restoreAdminState();
        this.setupConnectionMonitoring();
        this.retryAttempts = 3; // Number of retry attempts for operations
        this.lastKnownLeaderboardId = sessionStorage.getItem('lastLeaderboardId');
        this.restorePlayerNames();
        this.restoreLeaderboardButtons();
    }

    async restoreAdminState() {
        try {
            const gameStateRef = ref(realtimeDb, 'gameState');
            const gameSnapshot = await get(gameStateRef);
            const gameState = gameSnapshot.val();

            // Get lobby data first
            const lobbyRef = ref(realtimeDb, 'lobby');
            const lobbySnapshot = await get(lobbyRef);
            const lobbyData = lobbySnapshot.val() || {};

            // Store lobby data
            this.lobbyPlayers = lobbyData;

            if (gameState?.started) {
                const completionsSnapshot = await getDocs(collection(db, 'completions'));
                const finishedCount = completionsSnapshot.docs.length;

                if (gameState.totalPlayers) {
                    this.totalPlayers = gameState.totalPlayers;
                    this.updateCompletionStatus(finishedCount, gameState.totalPlayers);

                    // Always check if all players have finished and enable button accordingly
                    const publishButton = document.getElementById('publishLeaderboard');
                    if (publishButton) {
                        if (finishedCount >= gameState.totalPlayers) {
                            publishButton.disabled = false;
                            publishButton.classList.add('ready');
                        } else {
                            publishButton.disabled = true;
                            publishButton.classList.remove('ready');
                        }
                    }

                    await this.showCurrentLeaderboard();
                }

                this.listenForCompletions(gameState.totalPlayers);
            }

            // Update player list with stored lobby data
            this.updateAllStatuses();

            // Always create and enable publish/download buttons
            this.createPublishButton();
            this.createDownloadButton();
        } catch (error) {
            console.error('Error restoring admin state:', error);
        }
    }

    async restorePlayerNames() {
        try {
            // First try to get from realtime database
            const playerNamesRef = ref(realtimeDb, 'playerNames');
            const snapshot = await get(playerNamesRef);
            if (snapshot.exists()) {
                this.playerNames = snapshot.val();
                return;
            }

            // Fallback to session storage
            const savedNames = sessionStorage.getItem('playerNames');
            if (savedNames) {
                this.playerNames = JSON.parse(savedNames);
            }
        } catch (error) {
            console.error('Error restoring player names:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('startEvent').addEventListener('click', () => this.startEvent());
        document.getElementById('resetEvent').addEventListener('click', () => this.resetEvent());
    }

    setupAllRealtimeListeners() {
        // Store all unsubscribe functions
        this.unsubscribers = [];

        // Initialize state containers
        this.firestoreCompletions = {};
        this.lobbyPlayers = {};
        this.activePlayers = {};

        // Listen to Firebase Realtime Database
        this.setupRealtimeDatabaseListeners();
        
        // Listen to Firestore
        this.setupFirestoreListeners();
    }

    setupFirestoreListeners() {
        // Listen to Firestore completions
        const completionsUnsubscribe = onSnapshot(
            collection(db, 'completions'),
            (snapshot) => {
                this.firestoreCompletions = {};
                snapshot.forEach(doc => {
                    this.firestoreCompletions[doc.id] = doc.data();
                });
                this.updateAllStatuses();
            },
            (error) => {
                console.error('Firestore completions listener error:', error);
            }
        );

        this.unsubscribers.push(completionsUnsubscribe);
    }

    setupRealtimeDatabaseListeners() {
        // Listen for lobby changes
        const lobbyRef = ref(realtimeDb, 'lobby');
        const lobbyUnsubscribe = onValue(lobbyRef, (snapshot) => {
            this.lobbyPlayers = snapshot.val() || {};
            this.lastKnownPlayers = this.lobbyPlayers; // Store for reference
            this.updateAllStatuses();
        });

        // Listen for puzzle states
        const puzzleStatesRef = ref(realtimeDb, 'puzzleStates');
        const puzzleStatesUnsubscribe = onValue(puzzleStatesRef, (snapshot) => {
            this.activePlayers = snapshot.val() || {};
            this.updateAllStatuses();
        });

        this.unsubscribers.push(lobbyUnsubscribe, puzzleStatesUnsubscribe);
    }

    updateAllStatuses() {
        // First get all player names from our stored data
        const allPlayers = new Map();
        
        // Add stored player names first
        if (this.playerNames) {
            Object.entries(this.playerNames).forEach(([id, name]) => {
                allPlayers.set(id, { name, status: 'unknown' });
            });
        }

        // Update with lobby data
        Object.entries(this.lobbyPlayers || {}).forEach(([id, player]) => {
            if (allPlayers.has(id)) {
                allPlayers.get(id).status = 'inlobby';
            } else {
                allPlayers.set(id, {
                    name: player.name,
                    status: 'inlobby'
                });
            }
        });

        // Update with active players
        Object.entries(this.activePlayers || {}).forEach(([id, player]) => {
            if (allPlayers.has(id)) {
                allPlayers.get(id).status = 'playing';
            } else {
                allPlayers.set(id, {
                    name: player.name || this.playerNames?.[id] || 'Unknown',
                    status: 'playing'
                });
            }
        });

        // Update with Firestore completions
        Object.entries(this.firestoreCompletions || {}).forEach(([id, data]) => {
            if (allPlayers.has(id)) {
                const player = allPlayers.get(id);
                player.status = data.status;
                player.time = data.time;
                player.moves = data.moves;
                player.timeoutProgress = data.timeoutProgress;
            }
        });

        // Update the UI with combined data
        this.updatePlayerListUI(Array.from(allPlayers.entries()));
    }

    updatePlayerListUI(players) {
        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('connectedCount');
        
        playerList.innerHTML = '';
        playerCount.textContent = players.length;

        players.forEach(([id, player]) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-entry';
            
            const statusClass = this.getStatusClass(player.status);
            const statusText = this.getStatusText(player.status);

            let details = '';
            if (player.status === 'completed') {
                details = `<div class="player-details">
                    Time: ${this.formatTime(player.time)}, 
                    Moves: ${player.moves}
                </div>`;
            }

            // Changed onclick to use this.removePlayer.bind(this)
            playerElement.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-status ${statusClass}">${statusText}</span>
                    <button class="remove-player-btn" 
                            onclick="document.querySelector('.admin-panel')?._instance?.removePlayer('${id}')">
                        Remove
                    </button>
                </div>
                ${details}
            `;
            
            playerList.appendChild(playerElement);
        });
    }

    async removePlayer(playerId) {
        if (!confirm('Are you sure you want to remove this player?')) {
            return;
        }

        try {
            // Get player name before removal for message
            let playerName = 'Unknown Player';
            try {
                const lobbyRef = ref(realtimeDb, `lobby/${playerId}`);
                const lobbySnapshot = await get(lobbyRef);
                if (lobbySnapshot.exists()) {
                    playerName = lobbySnapshot.val()?.name || 'Unknown Player';
                }
            } catch (error) {
                console.warn('Could not get player name:', error);
            }

            // Remove all player data concurrently
            await Promise.all([
                // Remove from lobby
                set(ref(realtimeDb, `lobby/${playerId}`), null),
                // Remove from puzzle states
                set(ref(realtimeDb, `puzzleStates/${playerId}`), null),
                // Remove from players
                set(ref(realtimeDb, `players/${playerId}`), null),
                // Remove from player names
                set(ref(realtimeDb, `playerNames/${playerId}`), null),
                // Remove from completions in Firestore
                deleteDoc(doc(db, 'completions', playerId)),
                // Remove from active puzzles
                set(ref(realtimeDb, `activePuzzles/${playerId}`), null),
            ]);

            // Update game state total players count
            const gameStateRef = ref(realtimeDb, 'gameState');
            const gameStateSnap = await get(gameStateRef);
            if (gameStateSnap.exists()) {
                const gameState = gameStateSnap.val();
                const newTotal = Math.max(0, (gameState.totalPlayers || 1) - 1);
                
                // Update game state with new total
                await set(ref(realtimeDb, 'gameState'), {
                    ...gameState,
                    totalPlayers: newTotal
                });

                // Update local state
                this.totalPlayers = newTotal;
            }

            // Remove from local state
            if (this.playerNames && this.playerNames[playerId]) {
                delete this.playerNames[playerId];
            }
            if (this.lobbyPlayers && this.lobbyPlayers[playerId]) {
                delete this.lobbyPlayers[playerId];
            }
            if (this.firestoreCompletions && this.firestoreCompletions[playerId]) {
                delete this.firestoreCompletions[playerId];
            }

            // Force immediate UI update
            this.updateAllStatuses();

            // Get current completion count
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const finishedCount = completionsSnapshot.docs.length;
            
            // Update completion counter
            this.updateCompletionStatus(finishedCount, this.totalPlayers);

            // Show success message
            this.showStatusMessage(`Player ${playerName} has been removed`);

            // Set removal flag to trigger client-side redirect
            await set(ref(realtimeDb, `playerRemoval/${playerId}`), {
                timestamp: Date.now(),
                action: 'remove',
                removedBy: 'admin'
            });

        } catch (error) {
            console.error('Error removing player:', error);
            this.showStatusMessage('Failed to remove player', true);
        }
    }

    updatePlayerList(players = {}) {  // Add default empty object
        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('connectedCount');
        
        if (!playerList || !playerCount) {
            console.log('Required elements not found');
            return;
        }

        playerList.innerHTML = '';
        const count = Object.keys(players).length;
        playerCount.textContent = count;

        if (count === 0) {
            playerList.innerHTML = '<div class="no-players">No players connected</div>';
            return;
        }

        // Continue with existing player list update logic
        this.getPlayerStatuses().then(playerStatuses => {
            // ...existing code...
        });
    }

    async getPlayerStatuses() {
        try {
            const lobbyRef = ref(realtimeDb, 'lobby');
            const lobbySnapshot = await get(lobbyRef);
            const lobbyPlayers = lobbySnapshot.val() || {};

            // Get completions from Firestore instead of realtime DB
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const completions = {};
            completionsSnapshot.forEach(doc => {
                completions[doc.id] = doc.data();
            });

            const puzzleStatesRef = ref(realtimeDb, 'puzzleStates');
            const puzzleStatesSnapshot = await get(puzzleStatesRef);
            const puzzleStates = puzzleStatesSnapshot.val() || {};

            const playerStatuses = {};

            // First mark all lobby players as 'inlobby'
            Object.keys(lobbyPlayers).forEach(playerId => {
                playerStatuses[playerId] = 'inlobby';
            });

            // Then check completions from Firestore
            Object.entries(completions).forEach(([playerId, data]) => {
                if (data.status === 'timeout') {
                    playerStatuses[playerId] = 'timeout';
                } else if (data.status === 'completed') {
                    playerStatuses[playerId] = 'completed';
                }
            });

            // Finally, check if they're actively playing
            Object.keys(puzzleStates).forEach(playerId => {
                if (!playerStatuses[playerId] || playerStatuses[playerId] === 'inlobby') {
                    playerStatuses[playerId] = 'playing';
                }
            });

            return playerStatuses;
        } catch (error) {
            console.error('Error getting player statuses:', error);
            return {};
        }
    }

    getStatusClass(status) {
        switch (status) {
            case 'inlobby':
                return 'status-inlobby';
            case 'playing':
                return 'status-playing';
            case 'completed':
                return 'status-completed';
            case 'timeout':
                return 'status-timeout';
            default:
                return '';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'inlobby':
                return 'In Lobby';
            case 'playing':
                return 'Playing';
            case 'completed':
                return 'Completed';
            case 'timeout':
                return 'Time Up';
            default:
                return 'Unknown';
        }
    }

    async getCurrentPuzzle() {
        try {
            const currentPuzzleRef = ref(realtimeDb, 'currentPuzzle');
            const snapshot = await get(currentPuzzleRef);
            this.currentPuzzle = snapshot.val();
            console.log('Current puzzle loaded:', this.currentPuzzle);
        } catch (error) {
            console.error('Error getting current puzzle:', error);
        }
    }

    async startEvent() {
        try {
            const puzzleRef = ref(realtimeDb, 'currentPuzzle');
            const puzzleSnapshot = await get(puzzleRef);
            const puzzleData = puzzleSnapshot.val();

            if (!puzzleData?.puzzleNumber) {
                this.showStatusMessage('No active puzzle found. Please generate a puzzle first.', true);
                return;
            }

            // Get and store lobby data first
            const lobbyRef = ref(realtimeDb, 'lobby');
            const lobbySnapshot = await get(lobbyRef);
            const players = lobbySnapshot.val() || {};
            const totalPlayers = Object.keys(players).length;

            if (totalPlayers === 0) {
                this.showStatusMessage('No players in lobby!', true);
                return;
            }

            if (!confirm(`Start game with ${totalPlayers} players?`)) {
                return;
            }

            // Create a players map with names preserved
            const playersMap = Object.entries(players).reduce((acc, [id, player]) => {
                acc[id] = {
                    name: player.name,
                    status: 'playing',
                    startTime: Date.now(),
                    registeredAt: player.registeredAt || Date.now()
                };
                return acc;
            }, {});

            // Create game state with preserved player data
            const gameState = {
                started: true,
                puzzleNumber: puzzleData.puzzleNumber,
                startedAt: Date.now(),
                totalPlayers: totalPlayers,
                completedPlayers: 0,
                leaderboardPublished: false,
                timeLimit: 5 * 60 * 1000,
                puzzle: {
                    number: puzzleData.puzzleNumber,
                    url: `/puzzle${puzzleData.puzzleNumber}.html`
                },
                players: playersMap // Store the complete player data
            };

            // Store player names in local state for backup
            this.playerNames = Object.entries(players).reduce((acc, [id, player]) => {
                acc[id] = player.name;
                return acc;
            }, {});

            // Update game state
            await set(ref(realtimeDb, 'gameState'), gameState);

            // Also store player names in a separate location for redundancy
            await set(ref(realtimeDb, 'playerNames'), this.playerNames);

            this.showStatusMessage(`Game started with ${totalPlayers} players!`);
            this.listenForCompletions(totalPlayers);
        } catch (error) {
            console.error('Error starting event:', error);
            this.showStatusMessage('Error starting game. Please try again.', true);
        }
    }

    async listenForCompletions(totalPlayers) {
        this.totalPlayers = totalPlayers;
        const completionsQuery = query(collection(db, 'completions'));
        
        const unsubscribe = onSnapshot(completionsQuery, async (snapshot) => {
            const finishedCount = snapshot.docs.length; // Count all completions
            
            await set(ref(realtimeDb, 'gameState/completedPlayers'), finishedCount);
            this.updateCompletionStatus(finishedCount, totalPlayers);

            // Store state for persistence
            sessionStorage.setItem('adminState', JSON.stringify({
                totalPlayers,
                finishedCount,
                lastUpdate: Date.now()
            }));

            // Always enable publish button regardless of completion status
            const publishButton = document.getElementById('publishLeaderboard');
            if (publishButton) {
                publishButton.disabled = false;
                publishButton.classList.add('ready');
            }

            // Show current leaderboard regardless of completion status
            await this.showCurrentLeaderboard();
        });

        this.unsubscribers.push(unsubscribe);

        // Create publish and download buttons immediately
        this.createPublishButton();
        this.createDownloadButton();
    }

    async createPublishButton() {
        const controlPanel = document.querySelector('.control-panel');
        if (!controlPanel) return;
        
        // Remove existing publish button if any
        const existingBtn = document.getElementById('publishLeaderboard');
        if (existingBtn) existingBtn.remove();

        const publishBtn = document.createElement('button');
        publishBtn.id = 'publishLeaderboard';
        publishBtn.className = 'admin-button ready'; // Always add ready class
        publishBtn.textContent = 'Publish Leaderboard';
        publishBtn.onclick = () => this.publishLeaderboard();
        publishBtn.disabled = false; // Always enable button

        controlPanel.appendChild(publishBtn);
    }

    async showCurrentLeaderboard() {
        try {
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const players = [];
            
            completionsSnapshot.forEach(doc => {
                const completion = doc.data();
                // Get correct tiles from either timeoutProgress or direct tilesCorrect
                const tilesCorrect = completion.status === 'timeout' 
                    ? (completion.timeoutProgress?.tilesCorrect || completion.tilesCorrect || 0)
                    : 11;

                const player = {
                    id: doc.id,
                    name: completion.name,
                    status: completion.status,
                    time: completion.time,
                    moves: completion.moves || 0,
                    points: completion.status === 'completed' ? 10 : 0, // Timeout players get 0 points
                    accuracy: completion.status === 'completed' ? 100 : Math.round((tilesCorrect / 11) * 100),
                    timeoutProgress: {
                        tilesCorrect: tilesCorrect,
                        totalTiles: 11
                    }
                };

                players.push(player);
            });

            // Use LeaderboardManager's sorting logic
            const completed = players.filter(p => p.status === 'completed');
            const timeout = players.filter(p => p.status === 'timeout');

            const rankedCompleted = completed.sort((a, b) => {
                if (a.time !== b.time) return a.time - b.time;
                return a.moves - b.moves;
            });

            const rankedTimeout = timeout.sort((a, b) => {
                const aTiles = a.timeoutProgress?.tilesCorrect || 0;
                const bTiles = b.timeoutProgress?.tilesCorrect || 0;
                if (aTiles !== bTiles) return bTiles - aTiles;
                return a.moves - b.moves;
            });

            const rankedPlayers = [...rankedCompleted, ...rankedTimeout];

            // Update the display section
            const leaderboardSection = document.getElementById('currentLeaderboard');
            if (!leaderboardSection) {
                const newSection = this.createLeaderboardSection();
                this.updateLeaderboardContent(newSection, rankedPlayers);
            } else {
                this.updateLeaderboardContent(leaderboardSection, rankedPlayers);
            }
        } catch (error) {
            console.error('Error showing leaderboard:', error);
        }
    }

    updateLeaderboardContent(section, players) {
        section.innerHTML = `
            <h3>Current Results</h3>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Team Name</th>
                        <th>Status</th>
                        <th>Time/Progress</th>
                        <th>Moves</th>
                        <th>Accuracy</th>
                        <th>Points</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${players.map((player, index) => {
                        const rank = index + 1;
                        const statusClass = player.status === 'completed' ? 'completed' : 'in-progress';
                        const timeDisplay = player.status === 'completed' 
                            ? formatTime(player.time) 
                            : `Timeout (${player.timeoutProgress.tilesCorrect}/11 tiles)`;
                        
                        // Calculate accuracy but keep points 0 for timeout
                        if (player.status === 'timeout') {
                            player.accuracy = Math.round((player.timeoutProgress.tilesCorrect / 11) * 100);
                            player.points = 0; // Timeout players always get 0 points
                        }

                        return `
                            <tr class="${statusClass}">
                                <td>${rank}</td>
                                <td>${player.name}</td>
                                <td>${player.status}</td>
                                <td>${timeDisplay}</td>
                                <td>${player.moves}</td>
                                <td>${player.accuracy}%</td>
                                <td>${player.points}</td>
                                <td>
                                    <button onclick="deletePlayer('${player.id}')" class="delete-btn">Delete</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    async publishLeaderboard() {
        try {
            const leaderboardId = Date.now().toString();
            
            await this.withRetry(async () => {
                const completionsSnapshot = await getDocs(collection(db, 'completions'));
                const completions = [];
                
                completionsSnapshot.forEach(doc => {
                    const data = doc.data();
                    // Ensure we have valid data for both completed and timeout cases
                    completions.push({
                        id: doc.id,
                        ...data,
                        name: data.name || 'Unknown',
                        status: data.status || 'unknown',
                        // For timeout players, set time to max time limit
                        time: data.status === 'timeout' ? (5 * 60 * 1000) : (data.time || 5 * 60 * 1000),
                        moves: data.moves || 0,
                        timestamp: new Date(data.completedAt || Date.now()).getTime(),
                        timeoutProgress: data.timeoutProgress || {
                            tilesCorrect: 0,
                            totalTiles: 11
                        }
                    });
                });

                // Prepare realtime database data with validated entries
                const realtimeData = {};
                completions.forEach((player) => {
                    realtimeData[player.id] = {
                        name: String(player.name || 'Unknown'),
                        status: String(player.status || 'unknown'),
                        // Ensure time is always a number
                        time: player.status === 'completed' ? Number(player.time) : (5 * 60 * 1000),
                        moves: Number(player.moves || 0),
                        tilesCompleted: Number(player.timeoutProgress?.tilesCorrect || 0),
                        totalTiles: 11,
                        accuracy: player.status === 'completed' ? 100 : 
                            Math.round(((player.timeoutProgress?.tilesCorrect || 0) / 11) * 100),
                        points: player.status === 'completed' ? 10 : 
                            Math.round(((player.timeoutProgress?.tilesCorrect || 0) / 11) * 10)
                    };
                });

                // Save to Firestore first
                const leaderboardDoc = {
                    results: completions.map((player, index) => ({
                        ...player,
                        rank: index + 1
                    })),
                    publishedAt: new Date().toISOString(),
                    puzzleNumber: this.currentPuzzle?.puzzleNumber,
                    totalPlayers: this.totalPlayers,
                    completedPlayers: completions.filter(p => p.status === 'completed').length,
                    timeoutPlayers: completions.filter(p => p.status === 'timeout').length
                };

                await setDoc(doc(db, 'leaderboards', leaderboardId), leaderboardDoc);

                // Then update realtime database
                await set(ref(realtimeDb, 'leaderboard'), realtimeData);

                // Update game state to mark leaderboard as published
                await set(ref(realtimeDb, 'gameState'), {
                    leaderboardPublished: true,
                    leaderboardId: leaderboardId,
                    completedAt: new Date().toISOString()
                });

                // Signal users to redirect
                await set(ref(realtimeDb, 'systemState/redirect'), {
                    timestamp: Date.now(),
                    destination: 'leaderboard.html'
                });

                this.showStatusMessage('Leaderboard published! Users will be redirected to the leaderboard page.');
                this.createDownloadButton();

            });

        } catch (error) {
            console.error('Error publishing leaderboard:', error);
            this.showStatusMessage('Error publishing leaderboard. Please try again.', true);
        }
    }

    async resetEvent() {
        if (!confirm('Are you sure you want to reset the event? This will clear ALL data.')) return;

        try {
            // Close registration first
            await set(ref(realtimeDb, 'systemState/registration'), {
                isOpen: false,
                lastUpdated: Date.now()
            });

            // Send reset signal
            await set(ref(realtimeDb, 'systemState/reset'), {
                timestamp: Date.now(),
                action: 'reset',
                forcedReset: true
            });

            // Clear all Realtime Database data
            await Promise.all([
                set(ref(realtimeDb, 'gameState'), null),
                set(ref(realtimeDb, 'lobby'), null),
                set(ref(realtimeDb, 'puzzleStates'), null),
                set(ref(realtimeDb, 'leaderboard'), null),
                set(ref(realtimeDb, 'currentPuzzle'), null),
                set(ref(realtimeDb, 'playerNames'), null),
                set(ref(realtimeDb, 'activePuzzles'), null),
                set(ref(realtimeDb, 'puzzles'), null),
                set(ref(realtimeDb, 'players'), null),
                set(ref(realtimeDb, 'playerRemoval'), null),
                set(ref(realtimeDb, 'systemState/redirect'), null),
                set(ref(realtimeDb, 'gameState/players'), null)
            ]);

            // Clear Firestore collections
            const collections = ['completions', 'leaderboards'];
            for (const collectionName of collections) {
                const snapshot = await getDocs(collection(db, collectionName));
                const batch = writeBatch(db);
                
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
            }

            // Reset system state to default with registration closed
            await set(ref(realtimeDb, 'systemState'), {
                registration: { isOpen: false }, // Keep registration closed after reset
                reset: {
                    timestamp: Date.now(),
                    action: 'complete',
                    forcedReset: true
                }
            });

            // Rest of the existing reset code...
            this.clearAllLocalData();
            window.isResetting = true;

            this.showStatusMessage('System reset complete. Registration is closed. All data has been cleared.');
            
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Reset error:', error);
            this.showStatusMessage('Reset failed. Please try again.', true);
        }
    }

    clearAllLocalData() {
        // Clear all session storage
        sessionStorage.clear();
        
        // Clear all local storage
        localStorage.clear();
        
        // Clear any cookies related to the app
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    }

    async broadcastReset() {
        await set(ref(realtimeDb, 'systemState/reset'), {
            timestamp: Date.now(),
            action: 'reset'
        });
    }

    async showLeaderboard() {
        try {
            // Get completions from Firestore
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const completions = [];
            
            completionsSnapshot.forEach(doc => {
                completions.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            const sortedPlayers = completions.sort((a, b) => {
                if (a.time === null) return 1;
                if (b.time === null) return -1;
                return a.time - b.time;
            });

            const leaderboardHtml = sortedPlayers.map(([id, player], index) => {
                const time = player.time !== null ? this.formatTime(player.time) : 'N/A';
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${player.name}</td>
                        <td>${time}</td>
                        <td>${player.moves}</td>
                    </tr>
                `;
            }).join('');

            const leaderboardModal = document.createElement('div');
            leaderboardModal.className = 'leaderboard-modal';
            leaderboardModal.innerHTML = `
                <div class="leaderboard-content">
                    <h2>Leaderboard</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Time</th>
                                <th>Moves</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${leaderboardHtml}
                        </tbody>
                    </table>
                    <button onclick="document.querySelector('.leaderboard-modal').remove()">Close</button>
                </div>
            `;
            document.body.appendChild(leaderboardModal);
        } catch (error) {
            console.error('Error showing leaderboard:', error);
            alert('Error loading leaderboard data');
        }
    }

    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(1);
        return `${minutes}:${seconds.padStart(4, '0')}`;
    }

    // Add proper cleanup
    cleanup() {
        // Don't clear admin state on normal cleanup
        this.unsubscribers.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.intervals.forEach(clearInterval);
    }

    // Add method to clear admin state
    clearAdminState() {
        sessionStorage.removeItem('adminTotalPlayers');
        sessionStorage.removeItem('adminCompletionStatus');
        sessionStorage.removeItem('adminPublishButtonVisible');
        sessionStorage.removeItem('adminLeaderboardVisible');
    }

    showStatusMessage(message, isError = false) {
        const overlay = document.createElement('div');
        overlay.className = 'admin-message-overlay';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `admin-message ${isError ? 'error' : 'success'}`;
        messageDiv.textContent = message;
        
        overlay.appendChild(messageDiv);
        document.body.appendChild(overlay);

        // Remove the countdown display after successful start
        setTimeout(() => overlay.remove(), 3000);
    }

    updateCompletionStatus(completed, total) {
        // Store current status in sessionStorage
        sessionStorage.setItem('adminCompletionStatus', JSON.stringify({
            completed,
            total,
            timestamp: Date.now()
        }));

        // Create or update completion status display
        const statusHTML = `
            <div class="completion-counter">
                <div class="completion-numbers">
                    <span class="completed">${completed}</span>
                    <span class="separator">/</span>
                    <span class="total">${total}</span>
                </div>
                <div class="completion-progress">
                    <div class="progress-bar" style="width: ${(completed/total * 100)}%"></div>
                </div>
                <div class="completion-text">Players Completed</div>
            </div>
        `;

        // Find or create the status container
        let statusContainer = document.getElementById('completionStatus');
        if (!statusContainer) {
            statusContainer = document.createElement('div');
            statusContainer.id = 'completionStatus';
            statusContainer.className = 'completion-status';
            document.querySelector('.stats-panel').appendChild(statusContainer);
        }

        // Update the content
        statusContainer.innerHTML = statusHTML;

        // Add appropriate status classes
        statusContainer.className = 'completion-status';
        if (completed === total) {
            statusContainer.classList.add('all-completed');
        } else if (completed > 0) {
            statusContainer.classList.add('some-completed');
        }
    }

    setupConnectionMonitoring() {
        const connectedRef = ref(realtimeDb, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                console.log('Connected to Firebase');
            } else {
                console.log('Disconnected from Firebase');
                this.handleDisconnection();
            }
        });
    }

    handleDisconnection() {
        // Show reconnection message
        this.showStatusMessage('Connection lost. Attempting to reconnect...', true);
        
        // Attempt to reconnect
        setTimeout(() => this.reconnect(), 2000);
    }

    async reconnect() {
        try {
            // Test connection with a simple read
            await get(ref(realtimeDb, 'systemState'));
            this.showStatusMessage('Reconnected successfully!');
            
            // Restore data after reconnection
            await this.restorePlayerNames();
            await this.restoreLeaderboard();
            this.setupAllRealtimeListeners();
        } catch (error) {
            console.error('Reconnection failed:', error);
            // Try again after delay
            setTimeout(() => this.reconnect(), 5000);
        }
    }

    async restoreLeaderboard() {
        try {
            if (this.lastKnownLeaderboardId) {
                const leaderboardDoc = await getDoc(doc(db, 'leaderboards', this.lastKnownLeaderboardId));
                if (leaderboardDoc.exists()) {
                    const data = leaderboardDoc.data();
                    await this.showCurrentLeaderboard(); // Changed to use existing method
                    return;
                }
            }

            // If no specific leaderboard ID, generate new leaderboard
            await this.showCurrentLeaderboard(); // Use the existing method instead
        } catch (error) {
            console.error('Error restoring leaderboard:', error);
        }
    }

    calculateScore(playerData) {
        if (!playerData) return 0;
        
        if (playerData.status === 'completed') {
            return 100;
        }
        
        // For timeouts/in-progress, calculate based on correct tiles
        const correctTiles = playerData.timeoutProgress?.tilesCorrect || 0;
        const totalTiles = playerData.timeoutProgress?.totalTiles || 11;
        return Math.round((correctTiles / totalTiles) * 100);
    }

    async withRetry(operation, maxAttempts = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                lastError = error;
                
                if (attempt < maxAttempts) {
                    // Wait longer between each retry
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        
        throw lastError;
    }

    sortLeaderboardData(data) {
        return data.sort((a, b) => {
            // First sort by completion status
            if (a.status === 'completed' && b.status === 'completed') {
                // If both completed, sort by time
                if (a.time !== b.time) return a.time - b.time;
                // If times are equal, sort by moves
                if (a.moves !== b.moves) return a.moves - b.moves;
                // If moves are equal, use timestamp for stability
                return a.timestamp - b.timestamp;
            }
            if (a.status === 'completed') return -1;
            if (b.status === 'completed') return 1;
            
            // If neither completed, sort by progress
            const aProgress = a.timeoutProgress?.tilesCorrect || 0;
            const bProgress = b.timeoutProgress?.tilesCorrect || 0;
            if (aProgress !== bProgress) return bProgress - aProgress;
            
            // If same progress, sort by moves
            if (a.moves !== b.moves) return a.moves - b.moves;
            
            // Finally sort by timestamp for stability
            return a.timestamp - b.timestamp;
        });
    }

    createLeaderboardSection() {
        const leaderboardSection = document.createElement('div');
        leaderboardSection.id = 'currentLeaderboard';
        leaderboardSection.className = 'current-leaderboard';
        
        // Find or create the stats panel
        let statsPanel = document.querySelector('.stats-panel');
        if (!statsPanel) {
            statsPanel = document.createElement('div');
            statsPanel.className = 'stats-panel';
            document.body.appendChild(statsPanel);
        }
        
        // Add the leaderboard section to the stats panel
        statsPanel.appendChild(leaderboardSection);
        
        return leaderboardSection;
    }

    async restoreLeaderboardButtons() {
        try {
            const gameStateRef = ref(realtimeDb, 'gameState');
            const snapshot = await get(gameStateRef);
            const gameState = snapshot.val();

            if (gameState?.leaderboardPublished) {
                // If leaderboard was published, restore download button
                this.createDownloadButton();
                // Disable publish button
                const publishButton = document.getElementById('publishLeaderboard');
                if (publishButton) {
                    publishButton.disabled = true;
                    publishButton.classList.remove('ready');
                }
            }
        } catch (error) {
            console.error('Error restoring leaderboard buttons:', error);
        }
    }

    createDownloadButton() {
        const controlPanel = document.querySelector('.control-panel');
        const publishButton = document.getElementById('publishLeaderboard');
        
        if (!document.getElementById('downloadLeaderboard') && controlPanel) {
            const downloadBtn = document.createElement('button');
            downloadBtn.id = 'downloadLeaderboard';
            downloadBtn.className = 'admin-button';
            downloadBtn.textContent = 'Download Leaderboard';
            downloadBtn.onclick = async () => {
                try {
                    const completionsSnapshot = await getDocs(collection(db, 'completions'));
                    const players = [];
                    
                    completionsSnapshot.forEach(doc => {
                        const completion = doc.data();
                        const tilesCorrect = completion.status === 'timeout' 
                            ? (completion.timeoutProgress?.tilesCorrect || completion.tilesCorrect || 0)
                            : 11;

                        players.push({
                            id: doc.id,
                            name: completion.name,
                            status: completion.status,
                            time: completion.time,
                            moves: completion.moves || 0,
                            points: completion.status === 'completed' ? 10 : 0,
                            accuracy: completion.status === 'completed' ? 100 : Math.round((tilesCorrect / 11) * 100),
                            timeoutProgress: {
                                tilesCorrect: tilesCorrect,
                                totalTiles: 11
                            }
                        });
                    });

                    // Sort players using the same logic as before
                    const completed = players.filter(p => p.status === 'completed');
                    const timeout = players.filter(p => p.status === 'timeout');
                    const rankedCompleted = completed.sort((a, b) => {
                        if (a.time !== b.time) return a.time - b.time;
                        return a.moves - b.moves;
                    });
                    const rankedTimeout = timeout.sort((a, b) => {
                        const aTiles = a.timeoutProgress?.tilesCorrect || 0;
                        const bTiles = b.timeoutProgress?.tilesCorrect || 0;
                        if (aTiles !== bTiles) return bTiles - aTiles;
                        return a.moves - b.moves;
                    });
                    const rankedPlayers = [...rankedCompleted, ...rankedTimeout];

                    // Generate Excel file
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `puzzle_leaderboard_${timestamp}.xlsx`;
                    
                    const worksheet = XLSX.utils.json_to_sheet(rankedPlayers.map((player, index) => ({
                        Rank: index + 1,
                        Team_Name: player.name,
                        Status: player.status,
                        Time_Progress: player.status === 'completed' 
                            ? this.formatTime(player.time) 
                            : `Timeout (${player.timeoutProgress.tilesCorrect}/11 tiles)`,
                        Moves: player.moves,
                        Accuracy: `${player.accuracy}%`,
                        Points: player.points
                    })));
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "Leaderboard");
                    
                    XLSX.writeFile(workbook, filename);
                } catch (error) {
                    console.error('Error downloading leaderboard:', error);
                    this.showStatusMessage('Error downloading leaderboard', true);
                }
            };
            
            // Insert download button after publish button
            if (publishButton) {
                publishButton.parentNode.insertBefore(downloadBtn, publishButton.nextSibling);
            } else {
                controlPanel.appendChild(downloadBtn);
            }
        }
    }

    setupRegistrationControls() {
        const toggleRegistrationBtn = document.getElementById('toggleRegistration');
        if (!toggleRegistrationBtn) {
            console.warn('Registration toggle button not found');
            return;
        }

        toggleRegistrationBtn.addEventListener('click', () => this.toggleRegistration());
        this.updateRegistrationStatus(); // Get initial state
    }

    async toggleRegistration() {
        const toggleBtn = document.getElementById('toggleRegistration');
        
        try {
            toggleBtn.disabled = true; // Disable during operation
            
            const registrationRef = ref(realtimeDb, 'systemState/registration');
            const snapshot = await get(registrationRef);
            const currentState = snapshot.val();
            
            const newState = {
                isOpen: !(currentState?.isOpen ?? true),
                lastUpdated: Date.now()
            };

            await set(registrationRef, newState);
            this.updateRegistrationStatus(newState);
            
        } catch (error) {
            console.error('Error toggling registration:', error);
            alert('Failed to toggle registration state');
            toggleBtn.disabled = false;
        }
    }

    updateRegistrationStatus(state) {
        const toggleBtn = document.getElementById('toggleRegistration');
        const statusIndicator = document.getElementById('registrationStatus');
        
        if (!toggleBtn || !statusIndicator) {
            console.warn('Registration control elements not found');
            return;
        }

        toggleBtn.disabled = false;
        
        if (!state) {
            state = { isOpen: true }; // Default state
        }

        // Update button appearance
        toggleBtn.className = 'admin-button ' + (state.isOpen ? 'btn-danger' : 'btn-success');
        toggleBtn.textContent = state.isOpen ? 'Close Registration' : 'Open Registration';

        // Update status indicator
        statusIndicator.className = 'status-indicator ' + (state.isOpen ? 'status-open' : 'status-closed');
        statusIndicator.textContent = state.isOpen ? 'Registration Open' : 'Registration Closed';
    }

    // Add this method
    setupRegistrationListener() {
        const registrationRef = ref(realtimeDb, 'systemState/registration');
        onValue(registrationRef, (snapshot) => {
            const state = snapshot.val();
            this.updateRegistrationStatus(state);
        });
    }
}

// Only clear admin state on reset
window.addEventListener('unload', () => {
    const adminPanel = window._adminPanel;
    if (adminPanel && window.isResetting) {
        adminPanel.clearAdminState();
    }
    if (adminPanel) {
        adminPanel.cleanup();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const adminPanel = new AdminPanel();
    // Store instance on the admin panel element
    const adminPanelElement = document.querySelector('.admin-panel');
    if (adminPanelElement) {
        adminPanelElement._instance = adminPanel;
    }
    window._adminPanel = adminPanel;
});

// Update the Excel export event listener
document.getElementById('publishLeaderboard').addEventListener('click', async () => {
    try {
        // Get completions and process them exactly like the leaderboard
        const completionsSnapshot = await getDocs(collection(db, 'completions'));
        const players = [];
        
        completionsSnapshot.forEach(doc => {
            const completion = doc.data();
            // Ensure all values are defined with defaults
            const tilesCorrect = completion.status === 'timeout' 
                ? (completion.timeoutProgress?.tilesCorrect || completion.tilesCorrect || 0)
                : 11;

            const player = {
                id: doc.id,
                name: completion.name || 'Unknown',
                status: completion.status || 'unknown',
                time: completion.time || 0, // Default to 0 if undefined
                moves: completion.moves || 0,
                points: completion.status === 'completed' ? 10 : 0,
                accuracy: completion.status === 'completed' ? 100 : Math.round((tilesCorrect / 11) * 100),
                timeoutProgress: {
                    tilesCorrect: tilesCorrect,
                    totalTiles: 11
                }
            };

            players.push(player);
        });

        // Sort players
        const completed = players.filter(p => p.status === 'completed');
        const timeout = players.filter(p => p.status === 'timeout');

        const rankedCompleted = completed.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return a.moves - b.moves;
        });

        const rankedTimeout = timeout.sort((a, b) => {
            const aTiles = a.timeoutProgress?.tilesCorrect || 0;
            const bTiles = b.timeoutProgress?.tilesCorrect || 0;
            if (aTiles !== bTiles) return bTiles - aTiles;
            return a.moves - b.moves;
        });

        const rankedPlayers = [...rankedCompleted, ...rankedTimeout];

        // Create Excel workbook
        const worksheet = XLSX.utils.json_to_sheet(rankedPlayers.map((player, index) => ({
            Rank: index + 1,
            Team_Name: player.name,
            Status: player.status,
            Time_Progress: player.status === 'completed' 
                ? formatTime(player.time) 
                : `Timeout (${player.timeoutProgress.tilesCorrect}/11 tiles)`,
            Moves: player.moves,
            Accuracy: `${player.accuracy}%`,
            Points: player.points
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Leaderboard");

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `puzzle_leaderboard_${timestamp}.xlsx`;

        // Download Excel file
        XLSX.writeFile(workbook, filename);

        // Prepare data for realtime database
        const leaderboardData = rankedPlayers.reduce((acc, player, index) => {
            // Ensure all properties are defined and of correct type
            acc[player.id] = {
                name: String(player.name || 'Unknown'),
                rank: Number(index + 1),
                status: String(player.status || 'unknown'),
                time: Number(player.time || 0),
                moves: Number(player.moves || 0),
                tilesCompleted: Number(player.timeoutProgress?.tilesCorrect || 0),
                totalTiles: 11,
                accuracy: Number(player.accuracy || 0),
                points: Number(player.points || 0)
            };
            return acc;
        }, {});

        // Validate the entire leaderboard object before setting
        if (!Object.values(leaderboardData).every(entry => 
            typeof entry.time === 'number' && 
            !isNaN(entry.time) && 
            typeof entry.moves === 'number' && 
            !isNaN(entry.moves)
        )) {
            throw new Error('Invalid leaderboard data detected');
        }

        // Update realtime database
        const leaderboardRef = ref(realtimeDb, 'leaderboard');
        await set(leaderboardRef, leaderboardData);

        // Add leaderboard publication signal
        const gameStateRef = ref(realtimeDb, 'gameState');
        await set(gameStateRef, {
            leaderboardPublished: true,
            leaderboardId: Date.now().toString(),
            completedAt: new Date().toISOString()
        });

        // Signal users to redirect
        await set(ref(realtimeDb, 'systemState/redirect'), {
            timestamp: Date.now(),
            destination: 'leaderboard.html'
        });

        alert('Leaderboard published! Users will be redirected to the leaderboard page.');

        // Create download button if it doesn't exist
        const controlPanel = document.querySelector('.control-panel');
        const publishButton = document.getElementById('publishLeaderboard');
        if (!document.getElementById('downloadLeaderboard')) {
            const downloadBtn = document.createElement('button');
            downloadBtn.id = 'downloadLeaderboard';
            downloadBtn.className = 'admin-button';
            downloadBtn.textContent = 'Download Leaderboard';
            downloadBtn.onclick = () => {
                // Generate new Excel file with current timestamp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `puzzle_leaderboard_${timestamp}.xlsx`;
                
                const worksheet = XLSX.utils.json_to_sheet(rankedPlayers.map((player, index) => ({
                    Rank: index + 1,
                    Team_Name: player.name,
                    Status: player.status,
                    Time_Progress: player.status === 'completed' 
                        ? formatTime(player.time) 
                        : `Timeout (${player.timeoutProgress.tilesCorrect}/11 tiles)`,
                    Moves: player.moves,
                    Accuracy: `${player.accuracy}%`,
                    Points: player.points
                })));
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Leaderboard");
                
                XLSX.writeFile(workbook, filename);
            };
            
            // Insert download button after publish button
            publishButton.parentNode.insertBefore(downloadBtn, publishButton.nextSibling);
        }

        // Disable only the publish button
        if (publishButton) {
            publishButton.disabled = true;
            publishButton.classList.remove('ready');
        }

    } catch (error) {
        console.error('Error publishing leaderboard:', error);
        alert('Error publishing leaderboard. Please try again.');
    }
});

// Helper function to format time for Excel
function formatTime(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function to convert time string back to seconds
function convertTimeToSeconds(timeString) {
    const [minutes, seconds] = timeString.split(':').map(Number);
    return minutes * 60 + seconds;
}

async function generateLeaderboard() {
    try {
        // Get completions from Firestore only since it contains all necessary data
        const completionsSnapshot = await getDocs(collection(db, 'completions'));
        const players = [];
        
        completionsSnapshot.forEach(doc => {
            const completion = doc.data();
            const player = {
                id: doc.id,
                name: completion.name,
                status: completion.status,
                time: completion.time,
                moves: completion.moves || 0,
                timeoutProgress: completion.timeoutProgress || { tilesCorrect: 0, totalTiles: 11 }
            };

            // Calculate points and accuracy based on status
            if (completion.status === 'completed') {
                player.points = 10;
                player.accuracy = 100;
            } else {
                // Use timeoutProgress from Firestore for timeout cases
                const correctTiles = completion.timeoutProgress?.tilesCorrect || 0;
                player.accuracy = Math.round((correctTiles / 11) * 100);
                player.points = Math.round((correctTiles / 11) * 10);
            }

            players.push(player);
        });

        // Sort players
        const completed = players.filter(p => p.status === 'completed');
        const timeout = players.filter(p => p.status === 'timeout');

        const rankedCompleted = completed.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return a.moves - b.moves;
        });

        const rankedTimeout = timeout.sort((a, b) => {
            const aTiles = a.timeoutProgress?.tilesCorrect || 0;
            const bTiles = b.timeoutProgress?.tilesCorrect || 0;
            if (aTiles !== bTiles) return bTiles - aTiles;
            return a.moves - b.moves;
        });

        const rankedPlayers = [...rankedCompleted, ...rankedTimeout];

        // Update display
        const leaderboardBody = document.getElementById('leaderboardBody');
        leaderboardBody.innerHTML = rankedPlayers.map((player, index) => {
            const rank = index + 1;
            const timeDisplay = player.status === 'completed' 
                ? formatTime(player.time) 
                : `Timeout (${player.timeoutProgress.tilesCorrect}/11 tiles)`;
            
            return `
                <tr>
                    <td>${rank}</td>
                    <td>${player.name}</td>
                    <td>${timeDisplay}</td>
                    <td>${player.moves}</td>
                    <td>${player.accuracy}%</td>
                    <td>${player.points}</td>
                    <td>
                        <button onclick="deletePlayer('${player.id}')" class="delete-btn">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error generating leaderboard:', error);
        showError('Failed to generate leaderboard');
    }
}