import { realtimeDb, db } from './firebase-config.js';
import { ref, get, onValue, set } from 'firebase/database';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

function checkSession() {
    // Check for direct access flag first
    const isDirectAccess = sessionStorage.getItem('directAccess') === 'true';
    if (isDirectAccess) {
        return false; // Force registration flow for direct access
    }

    // Existing session check logic
    const gameStarted = sessionStorage.getItem('gameStarted') === 'true';
    const adminStarted = sessionStorage.getItem('adminStarted') === 'true';
    const hasValidPlayer = sessionStorage.getItem('playerId') && sessionStorage.getItem('playerName');
    const puzzleUrl = sessionStorage.getItem('puzzleReturnUrl');

    // If game is started and we have player data, allow direct access
    if ((gameStarted || adminStarted) && hasValidPlayer && puzzleUrl) {
        return true;
    }

    // For all other cases, continue with registration
    return false;
}

function checkDeviceReady() {
    // Allow registration always
    return true;
}

function cleanAllDeviceData() {
    console.log('Cleaning all device data');
    
    // Store current URL if it's a puzzle URL before cleaning
    const currentUrl = window.location.href;
    let puzzleReturnUrl = null;
    let puzzleNumber = null;

    if (currentUrl.includes('puzzle')) {
        puzzleReturnUrl = currentUrl;
        const puzzleMatch = currentUrl.match(/puzzle(\d+)\.html/);
        if (puzzleMatch) {
            puzzleNumber = puzzleMatch[1];
        }
    }

    // Clear all storage
    try {
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear all cookies
        document.cookie.split(";").forEach(cookie => {
            const [name] = cookie.trim().split("=");
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
    } catch (e) {
        console.error('Error during cleanup:', e);
    }

    // Set direct access flag
    sessionStorage.setItem('directAccess', 'true');
    
    // Restore only essential puzzle data if available
    if (puzzleReturnUrl) {
        console.log('Preserving puzzle URL:', puzzleReturnUrl);
        sessionStorage.setItem('puzzleReturnUrl', puzzleReturnUrl);
        if (puzzleNumber) {
            sessionStorage.setItem('puzzleNumber', puzzleNumber);
            sessionStorage.setItem('puzzleImageUrl', `/images/puzzles/puzzle${puzzleNumber}.png`);
        }
    }

    return true;
}

// Update the initialization logic to be more reliable
document.addEventListener('DOMContentLoaded', () => {
    // First check for session to avoid unnecessary cleanup
    if (checkSession()) {
        const puzzleUrl = sessionStorage.getItem('puzzleReturnUrl');
        if (puzzleUrl) {
            window.location.replace(puzzleUrl);
            return;
        }
    }

    // Only clean if we're actually on registration page
    if (window.location.pathname.includes('registration')) {
        const isDirectNavigation = !document.referrer || 
                                 !document.referrer.includes(window.location.host);
        
        if (isDirectNavigation) {
            console.log('Direct navigation detected, cleaning all data');
            cleanAllDeviceData();
        }
    }
    
    if (!checkDeviceReady()) return;
    setupSystemStateListener();
});

const joinGameBtn = document.getElementById('joinGameBtn');
const teamNameModal = document.getElementById('teamNameModal');
const confirmationModal = document.getElementById('confirmationModal');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const themeIcon = document.getElementById('theme-icon');

// Simplified theme switching with logo
themeIcon.addEventListener('click', () => {
    const themeSwitch = themeIcon.parentElement;
    
    themeSwitch.classList.add('switching');
    document.body.classList.toggle('dark-theme');
    
    themeIcon.setAttribute('name', 
        document.body.classList.contains('dark-theme') ? 'sunny-outline' : 'moon-outline'
    );
    
    setTimeout(() => {
        themeSwitch.classList.remove('switching');
    }, 500);
});

// Modal handling
joinGameBtn.addEventListener('click', async () => {
    if (await checkSystemState()) {
        teamNameModal.style.display = 'block';
        teamNameModal.querySelector('.modal-content').style.animation = 'popIn 0.3s forwards';
    }
});

// Add animation for modals
const animateModal = (modal, animation) => {
    modal.style.display = 'block';
    modal.querySelector('.modal-content').style.animation = animation;
};

joinLobbyBtn.addEventListener('click', () => {
    teamNameModal.style.display = 'none';
    animateModal(confirmationModal, 'slideIn 0.3s forwards');
});

confirmNo.addEventListener('click', () => {
    confirmationModal.style.display = 'none';
    teamNameModal.style.display = 'block';
});

async function joinGame(e) {
    if (e) e.preventDefault();
    
    const teamName = document.getElementById('teamName')?.value?.trim();
    if (!teamName) {
        console.error('No team name provided');
        return;
    }

    try {
        // Close modals first
        teamNameModal.style.display = 'none';
        confirmationModal.style.display = 'none';

        // Generate unique player ID
        const playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const puzzleUrl = sessionStorage.getItem('puzzleReturnUrl');

        // Clear directAccess flag before setting new data
        sessionStorage.removeItem('directAccess');

        // Store session data
        const sessionData = {
            playerId,
            playerName: teamName,
            justRegistered: 'true',
            fromRegistration: 'true' // Add this flag
        };

        // Update session storage
        Object.entries(sessionData).forEach(([key, value]) => {
            if (value) sessionStorage.setItem(key, value);
        });

        // Keep puzzle URL if it exists
        if (puzzleUrl) {
            sessionStorage.setItem('puzzleReturnUrl', puzzleUrl);
        }

        // Try Firebase
        try {
            await set(ref(realtimeDb, `players/${playerId}`), {
                name: teamName,
                puzzleUrl: puzzleUrl,
                status: 'registered',
                timestamp: Date.now()
            });
            
            console.log('Player registered successfully:', {
                playerId,
                playerName: teamName,
                puzzleUrl
            });
        } catch (firebaseError) {
            console.error('Firebase save error (continuing anyway):', firebaseError);
        }

        // Redirect to lobby with a small delay to ensure data is saved
        setTimeout(() => {
            window.location.replace('lobby.html');
        }, 100);

    } catch (error) {
        console.error('Registration error:', error);
        alert('Failed to join game. Please try again.');
        
        // Clear only the error state
        sessionStorage.removeItem('justRegistered');
        
        // Return to team name modal
        confirmationModal.style.display = 'none';
        teamNameModal.style.display = 'block';
    }
}

// Remove the inline script from registration.html and update event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Remove old event listener
    const confirmYes = document.getElementById('confirmYes');
    const oldListeners = confirmYes.cloneNode(true);
    confirmYes.parentNode.replaceChild(oldListeners, confirmYes);

    // Add new single event listener
    document.getElementById('confirmYes').addEventListener('click', joinGame);
});

document.addEventListener('DOMContentLoaded', () => {
    const confirmYes = document.getElementById('confirmYes');
    if (confirmYes) {
        // Remove any existing listeners
        const newConfirmYes = confirmYes.cloneNode(true);
        confirmYes.parentNode.replaceChild(newConfirmYes, confirmYes);
        
        // Add fresh listener
        newConfirmYes.addEventListener('click', (e) => {
            e.preventDefault();
            joinGame(e);
        });
    }

    // Update join lobby button listener
    const joinLobbyBtn = document.getElementById('joinLobbyBtn');
    if (joinLobbyBtn) {
        joinLobbyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const teamName = document.getElementById('teamName')?.value?.trim();
            if (!teamName) {
                alert('Please enter a team name');
                return;
            }
            teamNameModal.style.display = 'none';
            animateModal(confirmationModal, 'slideIn 0.3s forwards');
        });
    }
});

function cleanOldGameData() {
    // Keep device preferences and non-game data
    const savedTheme = localStorage.getItem('theme');
    const savedPreferences = localStorage.getItem('preferences');

    // Remove only game-specific data
    const gameKeys = [
        'gameState', 
        'puzzleState', 
        'gameInProgress', 
        'gameStarted'
    ];
    gameKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });

    // Restore device preferences
    if (savedTheme) localStorage.setItem('theme', savedTheme);
    if (savedPreferences) localStorage.setItem('preferences', savedPreferences);
}

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === teamNameModal) {
        teamNameModal.style.display = 'none';
    }
    if (e.target === confirmationModal) {
        confirmationModal.style.display = 'none';
    }
});

// Simplify animations
document.head.insertAdjacentHTML('beforeend', `
    <style>
        @keyframes popIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideIn {
            from { transform: translate(-50%, -60%); }
            to { transform: translate(-50%, -50%); }
        }
    </style>
`);

// Add hover sound effect for buttons
const buttons = document.querySelectorAll('button');
buttons.forEach(button => {
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.05) translateY(-2px)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1) translateY(0)';
    });
});

// Add glitch effect on title click
const gameTitle = document.querySelector('.game-title');
gameTitle.addEventListener('click', () => {
    gameTitle.style.animation = 'none';
    setTimeout(() => {
        gameTitle.style.animation = 'glitch 0.5s forwards';
    }, 10);
});

// Update modal animations
const modalAnimations = ''; // Remove since we consolidated animations

// Puzzle Animation with Image
const puzzleAnimation = () => {
    const puzzleContainer = document.getElementById('puzzleContainer');
    const imagePath = '/images/puzzle.png';
    const ROWS = 3;
    const COLS = 4;
    const TILE_GAP = 2;
    let ANIMATION_INTERVAL = 800;
    
    let emptyTileIndex = ROWS * COLS - 1;
    let tiles = [];
    let isAnimating = false;
    
    // Update dimension calculation to be more mobile-friendly
    const calculateDimensions = () => {
        const isMobile = window.innerWidth <= 768;
        let containerWidth, containerHeight;
        
        if (isMobile) {
            containerWidth = 280; // Smaller width for mobile
            containerHeight = 210; // Maintain 4:3 ratio
        } else {
            containerWidth = 400;
            containerHeight = 300;
        }
        
        // Use integer division to avoid subpixel rendering
        const tileWidth = Math.floor((containerWidth - ((COLS + 1) * TILE_GAP)) / COLS);
        const tileHeight = Math.floor((containerHeight - ((ROWS + 1) * TILE_GAP)) / ROWS);
        
        return {
            containerWidth,
            containerHeight,
            tileWidth,
            tileHeight,
            actualWidth: containerWidth,
            actualHeight: containerHeight
        };
    };
    
    // Get initial dimensions
    const dimensions = calculateDimensions();
    
    // Update container size
    puzzleContainer.style.width = `${dimensions.actualWidth}px`;
    puzzleContainer.style.height = `${dimensions.actualHeight}px`;
    
    // Add performance optimizations for mobile
    const optimizeMobile = () => {
        if (window.innerWidth <= 768) {
            ANIMATION_INTERVAL = 1000; // Slower animations on mobile
            puzzleContainer.style.willChange = 'transform';
            tiles.forEach(tile => {
                tile.style.willChange = 'transform';
            });
            
            // Cleanup will-change after animations
            setTimeout(() => {
                puzzleContainer.style.willChange = 'auto';
                tiles.forEach(tile => {
                    tile.style.willChange = 'auto';
                });
            }, 5000);
        }
    };

    // Add touch event handling
    window.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });

    // Optimize resize handling
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const newDimensions = calculateDimensions();
            puzzleContainer.style.width = `${newDimensions.actualWidth}px`;
            puzzleContainer.style.height = `${newDimensions.actualHeight}px`;
            positionTiles();
            optimizeMobile();
        }, 250);
    }, { passive: true });

    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Create tiles with exact positioning
    const createTiles = () => {
        const img = new Image();
        img.src = imagePath;
        img.onload = () => {
            const dimensions = calculateDimensions();
            for (let i = 0; i < ROWS * COLS; i++) {
                const tile = document.createElement('div');
                tile.className = 'puzzle-tile';
                tile.id = `tile${i}`;
                
                if (i === emptyTileIndex) {
                    tile.classList.add('empty');
                } else {
                    const tileImg = img.cloneNode();
                    const row = Math.floor(i / COLS);
                    const col = i % COLS;
                    
                    // Set precise image dimensions and position
                    tileImg.style.width = `${dimensions.actualWidth}px`;
                    tileImg.style.height = `${dimensions.actualHeight}px`;
                    tileImg.style.transform = `translate(${-col * (dimensions.tileWidth + TILE_GAP)}px, ${-row * (dimensions.tileHeight + TILE_GAP)}px)`;
                    
                    tile.appendChild(tileImg);
                }
                
                // Set exact tile dimensions
                tile.style.width = `${dimensions.tileWidth}px`;
                tile.style.height = `${dimensions.tileHeight}px`;
                tiles.push(tile);
                fragment.appendChild(tile);
            }
            
            puzzleContainer.appendChild(fragment);
            positionTiles();
            startAnimation();
        };
    };

    // Function to get valid moves for empty tile
    const getValidMoves = (emptyIndex) => {
        const moves = [];
        const row = Math.floor(emptyIndex / COLS);
        const col = emptyIndex % COLS;
        
        // Check all possible moves (up, down, left, right)
        if (row > 0) moves.push(emptyIndex - COLS); // up
        if (row < ROWS - 1) moves.push(emptyIndex + COLS); // down
        if (col > 0) moves.push(emptyIndex - 1); // left
        if (col < COLS - 1) moves.push(emptyIndex + 1); // right
        
        return moves;
    };

    // Optimize tile movement
    const moveTile = async (newPosition) => {
        if (isAnimating) return;
        isAnimating = true;
        
        const tileToMove = tiles[newPosition];
        const emptyTile = tiles[emptyTileIndex];
        
        // Use transform instead of top/left for better performance
        requestAnimationFrame(() => {
            const tempTransform = tileToMove.style.transform;
            tileToMove.style.transform = emptyTile.style.transform;
            emptyTile.style.transform = tempTransform;
            
            [tiles[emptyTileIndex], tiles[newPosition]] = [tiles[newPosition], tiles[emptyTileIndex]];
            emptyTileIndex = newPosition;
            
            setTimeout(() => {
                isAnimating = false;
            }, 300);
        });
    };

    // Update positioning calculation
    const positionTiles = () => {
        const dimensions = calculateDimensions();
        tiles.forEach((tile, index) => {
            const row = Math.floor(index / COLS);
            const col = index % COLS;
            // Ensure precise positioning with gap consideration
            const xPos = (col * dimensions.tileWidth) + ((col + 1) * TILE_GAP);
            const yPos = (row * dimensions.tileHeight) + ((row + 1) * TILE_GAP);
            tile.style.transform = `translate(${xPos}px, ${yPos}px)`;
            // Set exact tile dimensions
            tile.style.width = `${dimensions.tileWidth}px`;
            tile.style.height = `${dimensions.tileHeight}px`;
        });
    };

    // Optimized animation loop
    const startAnimation = () => {
        let lastMove = -1;
        
        const animate = () => {
            if (!document.hidden) {
                const validMoves = getValidMoves(emptyTileIndex)
                    .filter(move => move !== lastMove);
                    
                if (validMoves.length && !isAnimating) {
                    const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                    lastMove = emptyTileIndex;
                    moveTile(randomMove);
                }
            }
            setTimeout(animate, ANIMATION_INTERVAL);
        };
        
        animate();
    };

    // Initialize
    optimizeMobile();
    createTiles();
};

// Use passive event listeners for better scroll performance
window.addEventListener('load', puzzleAnimation, { passive: true });

// Use intersection observer for better performance
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.willChange = 'transform';
        } else {
            entry.target.style.willChange = 'auto';
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.puzzle-tile').forEach(tile => {
    observer.observe(tile);
});

// Remove duplicate animation styles
document.head.insertAdjacentHTML('beforeend', `
    <style>
        @keyframes modalEnter {
            from { 
                opacity: 0;
                transform: translate(-50%, -55%);
            }
            to { 
                opacity: 1;
                transform: translate(-50%, -50%);
            }
        }
    </style>
`);

const checkSystemState = async () => {
    try {
        const systemStateRef = ref(realtimeDb, 'systemState');
        const systemSnapshot = await get(systemStateRef);
        const systemState = systemSnapshot.val();

        // If system is in reset state, show message and redirect to thank you
        if (systemState?.reset?.action === 'reset') {
            alert('System reset initiated. Thank you for participating!');
            window.location.replace('/thankyou.html');
            return false;
        }

        // Check registration state
        const registrationState = systemState?.registration;
        if (!registrationState?.isOpen) {
            showRegistrationClosed();
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error checking system state:', error);
        showErrorMessage('Error checking registration status. Please try again later.');
        return false;
    }
};

const showSystemResetMessage = () => {
    const message = `
        <div class="modal-content">
            <h2>System Reset in Progress</h2>
            <p>The platform is currently being reset.</p>
            <p>Thank you for participating!</p>
            <button onclick="window.location.href='/thankyou.html'">Continue</button>
        </div>
    `;
    showModal(message);
};

const showRegistrationClosed = () => {
    const message = `
        <div class="modal-content">
            <h2>Registration Closed</h2>
            <p>Registration is currently closed for this puzzle.</p>
            <p>Please try again later or contact the administrator.</p>
            <button onclick="window.location.href='/'">Return to Home</button>
        </div>
    `;
    showModal(message);
};

const showErrorMessage = (message) => {
    const modalContent = `
        <div class="modal-content">
            <h2>Error</h2>
            <p>${message}</p>
            <button onclick="window.location.href='/'">Return to Home</button>
        </div>
    `;
    showModal(modalContent);
};

const showModal = (content) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = content;
    document.body.appendChild(modal);
};

// Set up system state listener
const setupSystemStateListener = () => {
    const systemStateRef = ref(realtimeDb, 'systemState');
    onValue(systemStateRef, (snapshot) => {
        const state = snapshot.val();
        if (state?.reset?.action === 'reset') {
            alert('System reset initiated. Thank you for participating!');
            window.location.replace('/thankyou.html');
        } else if (!state?.registration?.isOpen) {
            showRegistrationClosed();
        }
    });
};

// Add cleanup for direct link access
window.addEventListener('load', () => {
    // Check if this is a direct link access
    if (!document.referrer.includes(window.location.hostname)) {
        console.log('Direct link access detected - clearing all storage');
        cleanAllDeviceData();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!checkDeviceReady()) return;
    
    setupSystemStateListener();
});
