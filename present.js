import { db, realtimeDb } from './firebase-config.js';
import { ref, onValue, get, set } from 'firebase/database';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';

class PresentationManager {
    constructor() {
        this.currentPhase = 'registration';
        this.players = new Map();
        this.playerAvatars = new Map(); // Store player avatars
        this.firestoreCompletions = new Map(); // Add this to track completions
        this.initializeFirebaseListeners();
        this.setupPhaseTransitions();
        this.loadStoredData();
    }

    loadStoredData() {
        // Get stored data from localStorage
        const storedData = localStorage.getItem('presentationData');
        if (storedData) {
            const data = JSON.parse(storedData);
            this.playerAvatars = new Map(data.playerAvatars);
            this.players = new Map(data.players);
        }
    }

    initializeFirebaseListeners() {
        // Listen for new players joining
        const lobbyRef = ref(realtimeDb, 'lobby');
        onValue(lobbyRef, (snapshot) => {
            const players = snapshot.val() || {};
            this.updatePlayers(players);
        });

        // Listen for game state changes
        const gameStateRef = ref(realtimeDb, 'gameState');
        onValue(gameStateRef, (snapshot) => {
            const gameState = snapshot.val() || {};
            this.handleGameStateChange(gameState);
        });

        // Listen for puzzle state changes
        const puzzleStatesRef = ref(realtimeDb, 'puzzleStates');
        onValue(puzzleStatesRef, (snapshot) => {
            const puzzleStates = snapshot.val() || {};
            this.updateGameProgress(puzzleStates);
        });

        // Listen for completion states
        const completionsRef = ref(realtimeDb, 'completions');
        onValue(completionsRef, (snapshot) => {
            const completions = snapshot.val() || {};
            this.updateCompletions(completions);
        });

        // Add Firestore completions listener
        onSnapshot(collection(db, 'completions'), (snapshot) => {
            this.firestoreCompletions.clear();
            snapshot.forEach(doc => {
                this.firestoreCompletions.set(doc.id, doc.data());
            });
            // Update progress whenever completions change
            this.updateGameProgress(this.lastPuzzleStates || {});
        });
    }

    updatePlayers(players) {
        if (this.currentPhase !== 'registration') return;

        const grid = document.getElementById('joiningPlayers');
        const count = document.getElementById('playerCount');
        const oldCount = parseInt(count.textContent) || 0;
        const newCount = Object.keys(players).length;

        // Show loading animation when new players join
        if (newCount > oldCount) {
            this.showPlayerJoinAnimation();
        }

        grid.innerHTML = '';
        count.textContent = newCount;

        Object.entries(players).forEach(([id, player]) => {
            const card = this.createPlayerCard(player);
            grid.appendChild(card);
        });
    }

    showPlayerJoinAnimation() {
        const notification = document.createElement('div');
        notification.className = 'player-join-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">👋</div>
                <div class="notification-text">New player joined!</div>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 2000);
    }

    createPlayerCard(player) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="player-avatar">
                <img src="${player.avatar || '/images/avatar/default.png'}" alt="Player Avatar">
            </div>
            <div class="player-name">${player.name}</div>
        `;
        return card;
    }

    async handleGameStateChange(gameState) {
        if (gameState.started && !this.gameStarted) {
            this.gameStarted = true;
            // Show loading animation during transition
            this.showLoadingOverlay('Starting Game...');
            await this.capturePlayerAvatars();
            setTimeout(() => {
                this.hideLoadingOverlay();
                this.transitionToPhase('game');
            }, 2000);
        } else if (gameState.completed) {
            this.transitionToPhase('completion');
        } else if (gameState.leaderboardReady) {
            this.transitionToPhase('leaderboard');
            this.startLeaderboardCountdown();
        }
    }

    showLoadingOverlay(message) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loader-spinner"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    hideLoadingOverlay() {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 500);
        }
    }

    async capturePlayerAvatars() {
        try {
            const lobbyRef = ref(realtimeDb, 'lobby');
            const snapshot = await get(lobbyRef);
            const players = snapshot.val() || {};
            
            // Store avatars permanently
            Object.entries(players).forEach(([id, player]) => {
                this.playerAvatars.set(id, {
                    avatar: player.avatar || '/images/avatar/default.png',
                    name: player.name
                });
            });

            // Save avatars to realtime database for persistence
            await set(ref(realtimeDb, 'gameState/playerAvatars'), Object.fromEntries(this.playerAvatars));

            // Store in localStorage
            localStorage.setItem('presentationData', JSON.stringify({
                playerAvatars: Array.from(this.playerAvatars.entries()),
                players: Array.from(this.players.entries())
            }));
        } catch (error) {
            console.error('Error capturing avatars:', error);
        }
    }

    updateGameProgress(puzzleStates) {
        if (this.currentPhase !== 'game') return;

        const totalPlayers = Object.keys(puzzleStates).length;
        const completedPlayers = Object.values(puzzleStates)
            .filter(state => state.completed).length;

        const percentage = Math.round((completedPlayers / totalPlayers) * 100);
        this.updateProgressRing(percentage);
        this.updatePlayersProgress(puzzleStates);
    }

    updateProgressRing(percentage) {
        const circle = document.querySelector('.progress-ring-circle');
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        circle.style.strokeDashoffset = circumference - (percentage / 100) * circumference;
        
        document.getElementById('completionPercentage').textContent = percentage;
    }

    updatePlayersProgress(puzzleStates) {
        if (this.currentPhase !== 'game') return;

        this.lastPuzzleStates = puzzleStates;
        const container = document.getElementById('activePlayers');
        container.innerHTML = '';

        // Remove any existing leaderboard button first
        const existingButton = document.querySelector('.view-leaderboard-btn');
        if (existingButton) {
            existingButton.remove();
        }

        let anyPlaying = false;

        Object.entries(puzzleStates).forEach(([id, state]) => {
            const playerData = this.playerAvatars.get(id) || { 
                avatar: '/images/avatar/default.png',
                name: state.name || 'Unknown'
            };

            // Check completion status
            const firestoreCompletion = this.firestoreCompletions.get(id);
            const isCompleted = firestoreCompletion?.status === 'completed';
            const isTimeout = firestoreCompletion?.status === 'timeout' || 
                             state.timeoutReached === true || 
                             state.status === 'timeout';

            if (!isCompleted && !isTimeout) {
                anyPlaying = true;
            }

            // Calculate progress for circle
            let progressPercent = 0;
            if (!isCompleted && !isTimeout && state.tiles) {
                const tilesCorrect = state.tiles.reduce((count, tile, index) => {
                    if (index === 10 && tile === 0) return count + 1;
                    else if (index === 11 && tile === 11) return count + 1;
                    else if (index < 10 && tile === index + 1) return count + 1;
                    return count;
                }, 0);
                progressPercent = Math.round((tilesCorrect / 11) * 100);
            } else if (isCompleted) {
                progressPercent = 100;
            }

            const playerEl = document.createElement('div');
            playerEl.className = `player-box ${isCompleted ? 'completed' : ''} ${isTimeout ? 'timeout' : ''}`;
            
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            const offset = isCompleted ? 0 : circumference - (progressPercent / 100) * circumference;
            const strokeColor = isTimeout ? 'rgba(220, 53, 69, 0.8)' : 
                              isCompleted ? 'rgba(40, 167, 69, 0.8)' : 
                              'rgba(255, 193, 7, 0.8)';

            playerEl.innerHTML = `
                <div class="avatar-container">
                    <div class="progress-ring">
                        <svg viewBox="0 0 120 120">
                            <circle class="${isTimeout ? 'timeout' : ''}"
                                cx="60" cy="60" r="${radius}"
                                stroke="${strokeColor}"
                                style="stroke-dasharray: ${circumference};
                                       stroke-dashoffset: ${offset};"
                            />
                        </svg>
                    </div>
                    <img src="${playerData.avatar}" alt="${playerData.name}'s Avatar" class="player-avatar">
                    ${isCompleted ? '<div class="completion-check">✓</div>' : ''}
                </div>
                <div class="player-info">
                    <div class="player-name">${playerData.name}</div>
                    <div class="player-status ${isTimeout ? 'status-timeout' : (isCompleted ? 'status-completed' : 'status-playing')}">
                        ${isTimeout ? 'Timeout' : (isCompleted ? 'Completed' : 'Playing')}
                    </div>
                </div>
            `;
            container.appendChild(playerEl);
        });

        // Add leaderboard button only if no one is playing or user has completed
        const currentPlayerCompletion = this.firestoreCompletions.get(sessionStorage.getItem('playerId'));
        const isCurrentPlayerCompleted = currentPlayerCompletion?.status === 'completed';

        if (!anyPlaying || isCurrentPlayerCompleted) {
            const leaderboardButton = document.createElement('button');
            leaderboardButton.className = 'view-leaderboard-btn';
            leaderboardButton.innerHTML = 'View Leaderboard';
            leaderboardButton.onclick = () => this.showLeaderboardModal();
            container.insertAdjacentElement('afterend', leaderboardButton);
        }

        // Update overall progress based on Firestore completions
        const totalPlayers = Object.keys(puzzleStates).length;
        const completedPlayers = Array.from(this.firestoreCompletions.values())
            .filter(completion => completion.status === 'completed').length;
        
        this.updateProgressRing((completedPlayers / totalPlayers) * 100);

        // Remove existing leaderboard components
        const existingLeaderboardButton = document.querySelector('.view-leaderboard-btn');
        const existingLoader = document.querySelector('.leaderboard-loader');
        if (existingLeaderboardButton) existingLeaderboardButton.remove();
        if (existingLoader) existingLoader.remove();

        /* ...existing player status checking code... */

        // Add leaderboard waiting state if no one is playing
        if (!anyPlaying) {
            const leaderboardStatus = document.createElement('div');
            leaderboardStatus.className = 'leaderboard-loader';
            leaderboardStatus.innerHTML = `
                <div class="loader-spinner"></div>
                <p class="loader-text">Waiting for host to publish leaderboard...</p>
            `;
            container.insertAdjacentElement('afterend', leaderboardStatus);

            // Listen for leaderboard publication
            const gameStateRef = ref(realtimeDb, 'gameState');
            onValue(gameStateRef, (snapshot) => {
                const gameState = snapshot.val();
                if (gameState?.leaderboardPublished) {
                    this.showLeaderboardModal();
                    if (leaderboardStatus) leaderboardStatus.remove();
                }
            });
        }
    }

    async showLeaderboardModal() {
        try {
            const modal = document.createElement('div');
            modal.className = 'leaderboard-modal';
            
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const completions = {};
            completionsSnapshot.forEach(doc => {
                completions[doc.id] = { ...doc.data(), id: doc.id };
            });

            // Process players with proper completion data
            const players = Object.values(completions).map(completion => {
                const tilesCorrect = completion.status === 'timeout' 
                    ? (completion.timeoutProgress?.tilesCorrect || completion.tilesCorrect || 0)
                    : 11;

                return {
                    id: completion.id,
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
                };
            });

            // Sort players: completed first (by time), then timeout (by progress)
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

            // Updated modal content with more detailed information
            modal.innerHTML = `
                <div class="leaderboard-content">
                    <h2>Live Leaderboard</h2>
                    <table class="leaderboard-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Team</th>
                                <th>Time/Progress</th>
                                <th>Moves</th>
                                <th>Status</th>
                                <th>Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rankedPlayers.map((player, index) => `
                                <tr class="${player.id === sessionStorage.getItem('playerId') ? 'current-player' : ''}">
                                    <td>${index + 1}</td>
                                    <td class="team-column">
                                        <div class="team-info">
                                            <img src="${this.playerAvatars.get(player.id)?.avatar || '/images/avatar/default.png'}" 
                                                 alt="Avatar" class="team-avatar">
                                            <span>${player.name}</span>
                                        </div>
                                    </td>
                                    <td>${player.status === 'completed' ? 
                                         this.formatTime(player.time) : 
                                         `${player.timeoutProgress.tilesCorrect}/11 tiles`}</td>
                                    <td>${player.moves || '-'}</td>
                                    <td class="status ${player.status}">${player.status}</td>
                                    <td>${player.points}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <button class="close-modal">Close</button>
                </div>
            `;

            document.body.appendChild(modal);

            // Add close handler that redirects to thank you page
            const closeModal = () => {
                modal.classList.add('fade-out');
                setTimeout(() => {
                    modal.remove();
                    window.location.href = '/thankyou.html';
                }, 500);
            };

            modal.querySelector('.close-modal').onclick = closeModal;
            modal.onclick = (e) => {
                if (e.target === modal) closeModal();
            };

        } catch (error) {
            console.error('Error showing leaderboard:', error);
        }
    }

    calculateAccuracy(completion) {
        if (completion.status === 'completed') return 100;

        // Calculate accuracy based on correct tiles for timeout/incomplete players
        const tilesCorrect = completion.timeoutProgress?.tilesCorrect || 
                           completion.tilesCorrect || 
                           (completion.tiles ? this.getCorrectTileCount(completion) : 0);
        return Math.round((tilesCorrect / 11) * 100);
    }

    getCorrectTileCount(completion) {
        if (!completion.tiles) return 0;
        return completion.tiles.reduce((count, tile, index) => {
            if (index === 10 && tile === 0) return count + 1;
            else if (index === 11 && tile === 11) return count + 1;
            else if (index < 10 && tile === index + 1) return count + 1;
            return count;
        }, 0);
    }

    updateCompletions(completions) {
        if (this.currentPhase !== 'completion') return;

        const summary = document.getElementById('statsSummary');
        if (!summary) return;

        const stats = this.calculateGameStats(completions);
        summary.innerHTML = `
            <div class="stat">
                <h3>Average Time</h3>
                <p>${this.formatTime(stats.avgTime)}</p>
            </div>
            <div class="stat">
                <h3>Average Moves</h3>
                <p>${stats.avgMoves.toFixed(0)}</p>
            </div>
            <div class="stat">
                <h3>Completion Rate</h3>
                <p>${stats.completionRate}%</p>
            </div>
        `;
    }

    calculateGameStats(completions) {
        const completed = Object.values(completions).filter(c => c.status === 'completed');
        return {
            avgTime: completed.reduce((acc, c) => acc + c.time, 0) / completed.length,
            avgMoves: completed.reduce((acc, c) => acc + c.moves, 0) / completed.length,
            completionRate: Math.round((completed.length / Object.keys(completions).length) * 100)
        };
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    transitionToPhase(phase) {
        const phases = ['registration', 'game', 'completion', 'leaderboard'];
        phases.forEach(p => {
            const element = document.getElementById(`${p}Phase`);
            if (element) {
                element.classList.toggle('hidden', p !== phase);
            }
        });
        this.currentPhase = phase;
    }

    startLeaderboardCountdown() {
        let count = 5;
        const countdownEl = document.getElementById('countdownValue');
        
        const interval = setInterval(() => {
            count--;
            if (countdownEl) countdownEl.textContent = count;
            
            if (count <= 0) {
                clearInterval(interval);
                window.location.href = '/leaderboard.html';
            }
        }, 1000);
    }

    setupPhaseTransitions() {
        document.querySelectorAll('.game-phase').forEach(phase => {
            phase.addEventListener('transitionend', (e) => {
                if (e.propertyName === 'opacity' && phase.classList.contains('hidden')) {
                    phase.style.display = 'none';
                }
            });
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window._presentation = new PresentationManager();
});
