import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { realtimeDb } from './firebase-config.js';
import { ref, onValue, get } from 'firebase/database';

// Theme switching functionality
const themeIcon = document.getElementById('theme-icon');
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

// Check if feedback already submitted on page load
async function checkExistingFeedback() {
    const playerId = sessionStorage.getItem('playerId');
    
    // First check local storage
    if (localStorage.getItem(`feedback_${playerId}`)) {
        hideFeedbackElements();
        return true;
    }

    // Then check Firestore
    try {
        const feedbackRef = collection(db, 'feedback');
        const q = query(feedbackRef, where('playerId', '==', playerId));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            hideFeedbackElements();
            // Store in local storage to avoid future checks
            localStorage.setItem(`feedback_${playerId}`, 'true');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking feedback:', error);
        return false;
    }
}

function hideFeedbackElements() {
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackSection = document.getElementById('feedbackSection');
    const modal = document.getElementById('feedbackModal');
    
    if (feedbackBtn) feedbackBtn.style.display = 'none';
    if (feedbackSection) feedbackSection.innerHTML = '<h2>Thank you for your feedback!</h2>';
    if (modal) modal.style.display = 'none';
}

// Modal functionality with feedback storage
const modal = document.getElementById('feedbackModal');
const feedbackBtn = document.getElementById('feedbackBtn');
const closeBtn = document.querySelector('.close-btn');
const feedbackSection = document.getElementById('feedbackSection');
const feedbackForm = document.getElementById('feedbackForm');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkExistingFeedback();
    // ...rest of existing initialization code...
    document.querySelectorAll('.stars').forEach(starGroup => {
        const stars = starGroup.querySelectorAll('ion-icon');
        
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const value = star.getAttribute('data-value');
                updateStars(starGroup, value);
            });
    
            star.addEventListener('mouseover', () => {
                const value = star.getAttribute('data-value');
                previewStars(starGroup, value);
            });
        });
    
        starGroup.addEventListener('mouseleave', () => {
            const activeValue = starGroup.getAttribute('data-active') || 0;
            updateStars(starGroup, activeValue);
        });
    });
    new ThankYouManager();
});

feedbackBtn?.addEventListener('click', async () => {
    // Check system state before showing feedback
    const resetRef = ref(realtimeDb, 'systemState/reset');
    const snapshot = await get(resetRef);
    const resetData = snapshot.val();

    if (resetData?.action === 'reset' || resetData?.forcedReset) {
        alert('Feedback is currently disabled during system reset.');
        return;
    }

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
});

closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

// Star rating functionality
document.querySelectorAll('.stars').forEach(starGroup => {
    const stars = starGroup.querySelectorAll('ion-icon');
    
    stars.forEach(star => {
        star.addEventListener('click', () => {
            const value = star.getAttribute('data-value');
            updateStars(starGroup, value);
        });

        star.addEventListener('mouseover', () => {
            const value = star.getAttribute('data-value');
            previewStars(starGroup, value);
        });
    });

    starGroup.addEventListener('mouseleave', () => {
        const activeValue = starGroup.getAttribute('data-active') || 0;
        updateStars(starGroup, activeValue);
    });
});

function updateStars(container, value) {
    container.setAttribute('data-active', value);
    container.querySelectorAll('ion-icon').forEach(star => {
        const starValue = star.getAttribute('data-value');
        star.setAttribute('name', starValue <= value ? 'star' : 'star-outline');
        star.classList.toggle('active', starValue <= value);
    });
}

function previewStars(container, value) {
    container.querySelectorAll('ion-icon').forEach(star => {
        const starValue = star.getAttribute('data-value');
        star.setAttribute('name', starValue <= value ? 'star' : 'star-outline');
    });
}

// Updated form submission with Firestore storage
feedbackForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Use feedback-specific session data
    const playerId = sessionStorage.getItem('feedbackPlayerId');
    const playerName = sessionStorage.getItem('feedbackPlayerName');
    const puzzleNumber = sessionStorage.getItem('feedbackPuzzleNumber');
    
    if (!playerId || !playerName) {
        alert('Cannot submit feedback - missing player information');
        return;
    }

    try {
        const data = {
            playerId,
            playerName,
            timestamp: new Date().toISOString(),
            ratings: {
                enjoyment: parseInt(document.querySelector('[data-rating="enjoyment"]').getAttribute('data-active') || 0),
                difficulty: parseInt(document.querySelector('[data-rating="difficulty"]').getAttribute('data-active') || 0),
                recommendation: parseInt(document.querySelector('[data-rating="recommendation"]').getAttribute('data-active') || 0)
            },
            suggestion: document.getElementById('suggestion').value,
            puzzleNumber
        };

        await addDoc(collection(db, 'feedback'), data);
        localStorage.setItem(`feedback_${playerId}`, 'true');
        hideFeedbackElements();
        
        // Clear feedback session data after successful submission
        sessionStorage.removeItem('feedbackPlayerId');
        sessionStorage.removeItem('feedbackPlayerName');
        sessionStorage.removeItem('feedbackPuzzleNumber');

    } catch (error) {
        console.error('Error saving feedback:', error);
        alert('Error saving feedback. Please try again.');
    }
});

// Initialize with smooth loading
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    });
});

class ThankYouManager {
    constructor() {
        // Store completion data for feedback
        const playerId = sessionStorage.getItem('playerId');
        const playerName = sessionStorage.getItem('playerName');
        
        if (playerId) {
            sessionStorage.setItem('feedbackPlayerId', playerId);
            sessionStorage.setItem('feedbackPlayerName', playerName);
        }

        this.setupResetListener();
    }

    setupResetListener() {
        const resetRef = ref(realtimeDb, 'systemState/reset');
        onValue(resetRef, (snapshot) => {
            const resetData = snapshot.val();
            if (resetData?.action === 'reset') {
                window.location.replace('/');
            }
        });
    }

    async checkSystemState() {
        try {
            const resetRef = ref(realtimeDb, 'systemState/reset');
            const snapshot = await get(resetRef);
            const resetData = snapshot.val();

            // If system is in reset phase, hide feedback elements
            if (resetData?.action === 'reset' || resetData?.forcedReset) {
                this.hideFeedbackElements();
            }
        } catch (error) {
            console.error('Error checking system state:', error);
        }
    }

    hideFeedbackElements() {
        const feedbackBtn = document.getElementById('feedbackBtn');
        const feedbackSection = document.getElementById('feedbackSection');
        const modal = document.getElementById('feedbackModal');
        
        if (feedbackBtn) feedbackBtn.style.display = 'none';
        if (feedbackSection) feedbackSection.innerHTML = '<h2>System Reset in Progress</h2>';
        if (modal) modal.style.display = 'none';
    }

    cleanDeviceData() {
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();

        // Clear cookies
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        // Set flag that device is ready for new game
        localStorage.setItem('deviceCleaned', 'true');
    }
}
