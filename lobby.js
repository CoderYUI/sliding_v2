import { db, realtimeDb } from './firebase-config.js';
import { ref, onValue, set, push, get } from 'firebase/database';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

async function getCurrentPuzzleNumber() {
    const currentPuzzleRef = ref(realtimeDb, 'currentPuzzle');
    const snapshot = await get(currentPuzzleRef);
    const currentPuzzle = snapshot.val();
    return currentPuzzle?.puzzleNumber;
}

class LobbyManager {
    constructor() {
        this.playerId = sessionStorage.getItem('playerId');
        this.playerName = sessionStorage.getItem('playerName');
        this.puzzleUrl = sessionStorage.getItem('puzzleReturnUrl');

        if (!this.playerId || !this.puzzleUrl) {
            console.log('Missing required data, redirecting to registration');
            window.location.replace('/registration.html');
            return;
        }

        // Generate random avatar on initialization
        this.playerAvatar = this.getRandomAvatar();

        // Initialize lobby immediately
        this.initLobby();
        this.setupPlayerRedirectListener();
    }

    async initLobby() {
        try {
            // Get player data from Firebase
            const playerRef = ref(realtimeDb, `players/${this.playerId}`);
            const snapshot = await get(playerRef);
            const playerData = snapshot.val();

            if (!playerData) {
                throw new Error('Player data not found');
            }

            // Update player data in lobby with avatar
            await set(ref(realtimeDb, `lobby/${this.playerId}`), {
                name: this.playerName,
                ready: false,
                avatar: this.playerAvatar,
                lastActive: Date.now(),
                puzzleUrl: this.puzzleUrl
            });

            // Set up UI and listeners
            this.setupMainAvatar();
            this.setupResetListener();
            this.setupCountdownListener();
            this.listenForGameStart();
            this.showWaitingRoom();
            this.setupRealtimeListeners();

        } catch (error) {
            console.error('Lobby initialization error:', error);
            window.location.replace('/registration.html');
        }
    }

    listenForGameStart() {
        const gameStateRef = ref(realtimeDb, 'gameState');
        onValue(gameStateRef, async (snapshot) => {
            const gameState = snapshot.val();
            if (gameState?.started) {
                try {
                    // Store avatar in players section before redirecting
                    await set(ref(realtimeDb, `players/${this.playerId}`), {
                        avatar: this.playerAvatar,
                        name: this.playerName,
                        lastGameTimestamp: Date.now()
                    });

                    // Set all required session flags before redirecting
                    sessionStorage.setItem('gameStarted', 'true');
                    sessionStorage.setItem('fromLobby', 'true');
                    sessionStorage.setItem('puzzleNumber', gameState.puzzleNumber);
                    sessionStorage.setItem('gameTimeLimit', gameState.timeLimit || (5 * 60 * 1000));
                    sessionStorage.setItem('personalStartTime', Date.now().toString());
                    sessionStorage.setItem('playerAvatar', this.playerAvatar); // Store avatar in session

                    const puzzleUrl = sessionStorage.getItem('puzzleReturnUrl');
                    if (puzzleUrl) {
                        console.log('Starting game with session:', {
                            gameStarted: sessionStorage.getItem('gameStarted'),
                            fromLobby: sessionStorage.getItem('fromLobby'),
                            playerName: this.playerName,
                            playerId: this.playerId,
                            avatar: this.playerAvatar
                        });
                        window.location.href = puzzleUrl;
                    } else {
                        console.error('No puzzle URL found, using fallback');
                        window.location.href = `/puzzle${gameState.puzzleNumber}.html`;
                    }
                } catch (error) {
                    console.error('Error storing player avatar:', error);
                    // Continue with redirect even if avatar storage fails
                    window.location.href = puzzleUrl || `/puzzle${gameState.puzzleNumber}.html`;
                }
            }
        });
    }

    redirectToRegistration() {
        const currentUrl = window.location.href;
        if (currentUrl.includes('puzzle')) {
            sessionStorage.setItem('puzzleReturnUrl', currentUrl);
        }
        window.location.replace('/registration.html');
    }

    saveCurrentUrl() {
        const currentUrl = window.location.href;
        if (currentUrl.includes('puzzle')) {
            sessionStorage.setItem('puzzleReturnUrl', currentUrl);
            console.log('Saved current URL:', currentUrl);
        }
    }

    validateSession() {
        return sessionStorage.getItem('freshStart') === 'true' &&
               sessionStorage.getItem('justRegistered') === 'true' &&
               sessionStorage.getItem('playerId') &&
               sessionStorage.getItem('playerName');
    }

    initializeLobbySession() {
        // Get all required data from session
        this.playerId = sessionStorage.getItem('playerId');
        this.playerName = sessionStorage.getItem('playerName');
        this.firestoreDocId = sessionStorage.getItem('firestoreDocId');
        this.puzzleReturnUrl = sessionStorage.getItem('puzzleReturnUrl');

        console.log('Initializing lobby with:', {
            playerId: this.playerId,
            playerName: this.playerName,
            puzzleReturnUrl: this.puzzleReturnUrl
        });

        // Remove fresh start flag but keep other flags
        sessionStorage.removeItem('freshStart');

        // Initialize lobby
        this.setupMainAvatar();
        this.setupResetListener();
        this.setupCountdownListener();
        this.joinLobby();
    }

    async initializeWithFirestore() {
        try {
            // Get player data from Firestore
            const playerDoc = await getDoc(doc(db, 'players', this.firestoreDocId));
            if (playerDoc.exists()) {
                const playerData = playerDoc.data();
                console.log('Retrieved from Firestore:', playerData);

                // Store puzzle URL in session
                if (playerData.puzzleReturnUrl) {
                    sessionStorage.setItem('puzzleReturnUrl', playerData.puzzleReturnUrl);
                    this.originalPuzzleUrl = playerData.puzzleReturnUrl;
                    console.log('Restored puzzle URL:', this.originalPuzzleUrl);
                }
            }

            this.initializeNewLobbySession();
        } catch (error) {
            console.error('Error initializing from Firestore:', error);
            this.redirectToRegistration();
        }
    }

    loadStoredLobbyData() {
        try {
            const lobbyData = localStorage.getItem('lobbySession');
            if (!lobbyData) return null;

            const data = JSON.parse(lobbyData);
            // Verify we have all required data
            if (data.playerId && data.playerName && data.timestamp) {
                // Check if data is still valid (within last 24 hours)
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    return data;
                }
            }
            // Clear invalid data
            localStorage.removeItem('lobbySession');
            return null;
        } catch (error) {
            console.error('Error loading lobby data:', error);
            return null;
        }
    }

    initializeFromStorage(data) {
        // Restore all essential data
        this.playerId = data.playerId;
        this.playerName = data.playerName;
        this.playerAvatar = data.playerAvatar;
        this.originalPuzzleUrl = data.originalPuzzleUrl || null;

        // Update session storage
        sessionStorage.setItem('playerId', this.playerId);
        sessionStorage.setItem('playerName', this.playerName);
        sessionStorage.setItem('playerAvatar', this.playerAvatar);
        if (this.originalPuzzleUrl) {
            sessionStorage.setItem('puzzleReturnUrl', this.originalPuzzleUrl);
        }

        // Initialize components
        this.setupMainAvatar();
        this.setupResetListener();
        this.setupCountdownListener();
        this.rejoinLobby(); // Use special rejoin method
    }

    initializeNewLobbySession() {
        // Clear any old lobby data
        localStorage.removeItem('lobbySession');
        
        // Initialize with fresh state
        this.playerId = sessionStorage.getItem('playerId');
        this.playerName = sessionStorage.getItem('playerName');
        this.playerAvatar = this.getRandomAvatar();
        this.originalPuzzleUrl = sessionStorage.getItem('puzzleReturnUrl') || null;

        // Store lobby session data
        this.storeLobbyData();

        // Initialize components
        this.setupMainAvatar();
        this.setupResetListener();
        this.setupCountdownListener();
        this.joinLobby();
    }

    storeLobbyData() {
        const lobbyData = {
            playerId: this.playerId,
            playerName: this.playerName,
            playerAvatar: this.playerAvatar,
            originalPuzzleUrl: this.originalPuzzleUrl,
            timestamp: Date.now()
        };
        localStorage.setItem('lobbySession', JSON.stringify(lobbyData));
    }

    async rejoinLobby() {
        try {
            // Create player data object with only defined values
            const playerData = {
                name: this.playerName,
                ready: false,
                avatar: this.playerAvatar,
                lastActive: Date.now()
            };

            if (this.originalPuzzleUrl) {
                playerData.originalPuzzleUrl = this.originalPuzzleUrl;
            }

            // Update Firebase with current data
            await set(ref(realtimeDb, `lobby/${this.playerId}`), playerData);

            // Show waiting room and start listeners
            this.showWaitingRoom();
            this.setupRealtimeListeners();
            this.listenForGameStart();
        } catch (error) {
            console.error('Error rejoining lobby:', error);
            // If rejoin fails, try regular join
            this.joinLobby();
        }
    }

    initializeLobby() {
        this.playerId = sessionStorage.getItem('playerId');
        this.playerName = sessionStorage.getItem('playerName');
        
        // Initialize components
        this.setupMainAvatar();
        this.setupResetListener();
        this.setupCountdownListener();
        
        // Join lobby directly - no auto check needed
        this.joinLobby();
    }

    getRandomAvatar() {
        const avatarNumber = Math.floor(Math.random() * 9) + 1;
        return `/images/avatar/${avatarNumber}.png`;
    }

    setupMainAvatar() {
        const mainAvatarDiv = document.querySelector('.profile-section .avatar');
        if (mainAvatarDiv) {
            const avatarImg = document.createElement('img');
            avatarImg.src = this.playerAvatar;
            avatarImg.alt = 'Your Avatar';
            mainAvatarDiv.innerHTML = '';
            mainAvatarDiv.appendChild(avatarImg);
        }

        // Also update player name display
        const playerNameDisplay = document.getElementById('playerNameDisplay');
        if (playerNameDisplay) {
            playerNameDisplay.textContent = this.playerName;
        }
    }

    setupResetListener() {
        const resetRef = ref(realtimeDb, 'systemState/reset');
        onValue(resetRef, (snapshot) => {
            const resetData = snapshot.val();
            if (resetData?.action === 'reset') {
                // Clear all storage
                sessionStorage.clear();
                localStorage.clear();
                
                // Show message and redirect
                alert('The system has been reset. Returning to home page.');
                window.location.replace('/');
            }
        });
    }

    setupCountdownListener() {
        const countdownRef = ref(realtimeDb, 'systemState/countdown');
        onValue(countdownRef, (snapshot) => {
            const countdownData = snapshot.val();
            if (countdownData?.active) {
                this.showCountdown(countdownData.count);
            }
        });
    }

    showCountdown(count) {
        const countdownOverlay = document.getElementById('countdownOverlay');
        const countdownDisplay = document.getElementById('countdown');
        
        if (!countdownOverlay || !countdownDisplay) {
            console.warn('Countdown elements not found');
            return;
        }

        countdownOverlay.classList.add('active');
        countdownDisplay.textContent = count;

        if (count === 0) {
            setTimeout(() => {
                countdownOverlay.classList.remove('active');
                // Game will start automatically due to gameState change
            }, 1000);
        }
    }

    async joinLobby() {
        try {
            // Get puzzle URL from session or class property
            const puzzleReturnUrl = sessionStorage.getItem('puzzleReturnUrl') || this.originalPuzzleUrl;
            console.log('Joining lobby with URL:', puzzleReturnUrl);

            // Check for existing player first
            const lobbyRef = ref(realtimeDb, 'lobby');
            const snapshot = await get(lobbyRef);
            const existingPlayers = snapshot.val() || {};

            // Look for any existing entries with same player name or ID
            const existingPlayer = Object.entries(existingPlayers).find(([_, player]) => 
                player.name === this.playerName || 
                player.firestoreId === sessionStorage.getItem('firestoreDocId')
            );

            // Get puzzle return URL and corresponding image URL from session storage
            const puzzleNumber = puzzleReturnUrl?.match(/puzzle(\d+)\.html/)?.[1];
            const imageUrl = puzzleNumber ? `/images/puzzles/puzzle${puzzleNumber}.png` : null;

            // Create player data object with only defined values
            const playerData = {
                name: this.playerName,
                ready: false,
                avatar: this.playerAvatar,
                lastActive: Date.now(),
                puzzleReturnUrl: puzzleReturnUrl, // Store the return URL with player data
                puzzleImageUrl: imageUrl // Store image URL in player data
            };

            // Save to Firebase
            if (existingPlayer) {
                this.playerId = existingPlayer[0];
                await set(ref(realtimeDb, `lobby/${this.playerId}`), playerData);
            } else {
                const newLobbyRef = push(ref(realtimeDb, 'lobby'));
                this.playerId = newLobbyRef.key;
                await set(newLobbyRef, playerData);
            }

            // Store essential session data
            sessionStorage.setItem('playerId', this.playerId);
            sessionStorage.setItem('playerName', this.playerName);
            sessionStorage.setItem('puzzleImageUrl', imageUrl);

            // Show waiting room and start listeners
            this.showWaitingRoom();
            this.setupRealtimeListeners();
            this.listenForGameStart();

        } catch (error) {
            console.error('Error joining lobby:', error);
            throw error;
        }
    }

    setupRealtimeListeners() {
        const lobbyRef = ref(realtimeDb, 'lobby');
        onValue(lobbyRef, (snapshot) => {
            const players = snapshot.val() || {};
            this.updatePlayerList(players);
        });
    }

    updatePlayerList(players) {
        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('playerCount');
        
        playerList.innerHTML = '';
        const count = Object.keys(players).length;
        playerCount.textContent = count;

        Object.entries(players).forEach(([id, player]) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'player-avatar';
            const avatarImg = document.createElement('img');
            
            // Use the same avatar for the current player
            if (id === this.playerId) {
                avatarImg.src = this.playerAvatar;
            } else {
                avatarImg.src = player.avatar || this.getRandomAvatar();
            }
            
            avatarImg.alt = 'Player Avatar';
            avatarDiv.appendChild(avatarImg);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-name';
            nameDiv.textContent = player.name;

            playerElement.appendChild(avatarDiv);
            playerElement.appendChild(nameDiv);
            playerList.appendChild(playerElement);
        });
    }

    showWaitingRoom() {
        document.getElementById('waitingRoom').style.display = 'block';
        const playerNameDisplay = document.getElementById('playerNameDisplay');
        if (playerNameDisplay) {
            playerNameDisplay.textContent = this.playerName;
        }
    }

    async getPlayerData() {
        try {
            const lobbyRef = ref(realtimeDb, `lobby/${this.playerId}`);
            const snapshot = await get(lobbyRef);
            return snapshot.val();
        } catch (error) {
            console.error('Error getting player data:', error);
            return null;
        }
    }

    redirectToGame(puzzleUrl) {
        console.log('Redirecting to puzzle:', puzzleUrl);
        const sessionData = {
            playerName: this.playerName,
            playerId: this.playerId,
            fromLobby: 'true',
            justStarted: 'true',
            gameStarted: 'true',
            puzzleReturnUrl: puzzleUrl
        };

        // Update session storage
        Object.entries(sessionData).forEach(([key, value]) => {
            if (value) sessionStorage.setItem(key, value);
        });

        // Clear lobby session
        localStorage.removeItem('lobbySession');

        // Redirect to puzzle
        window.location.href = puzzleUrl;
    }

    startGame(puzzleUrl) {
        // Store player session info
        sessionStorage.setItem('playerId', this.playerId);
        sessionStorage.setItem('playerName', this.playerName);
        
        // Return to original puzzle if exists
        const returnUrl = sessionStorage.getItem('returnUrl');
        if (returnUrl) {
            window.location.href = returnUrl;
        } else {
            // If no return URL, use the provided puzzle URL
            window.location.href = puzzleUrl || 'index.html';
        }
    }

    // Add cleanup method
    cleanup() {
        if (this.playerId) {
            // Remove player from lobby on page unload
            const playerRef = ref(realtimeDb, `lobby/${this.playerId}`);
            set(playerRef, null);
        }
    }

    setupPlayerRedirectListener() {
        // Listen for kick messages
        const kickMessageRef = ref(realtimeDb, `systemState/kickMessage/${this.playerId}`);
        onValue(kickMessageRef, (snapshot) => {
            const kickData = snapshot.val();
            if (kickData) {
                this.showKickMessage(kickData.message);
            }
        });

        // Listen for redirects
        const redirectRef = ref(realtimeDb, `systemState/playerRedirect/${this.playerId}`);
        onValue(redirectRef, (snapshot) => {
            const redirectData = snapshot.val();
            if (redirectData?.destination === 'thankyou.html') {
                // Clear player data before redirect
                this.cleanup();
                window.location.href = 'thankyou.html';
            }
        });
    }

    showKickMessage(message) {
        const modal = document.createElement('div');
        modal.className = 'kick-modal';
        modal.innerHTML = `
            <div class="kick-content">
                <h2>Notice</h2>
                <p>${message}</p>
                <p>Redirecting you in a few seconds...</p>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .kick-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            }
            .kick-content {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                text-align: center;
                max-width: 400px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            .kick-content h2 {
                color: #ff4444;
                margin-bottom: 1rem;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
    }
}

// Add cleanup on page unload
window.addEventListener('unload', () => {
    // Only clear temporary flags
    sessionStorage.removeItem('freshStart');
    sessionStorage.removeItem('justRegistered');
});

// Add window unload handler
window.addEventListener('beforeunload', () => {
    const lobby = window._lobby;
    if (lobby) {
        lobby.cleanup();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window._lobby = new LobbyManager();
});
