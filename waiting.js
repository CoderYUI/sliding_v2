import { TimeSync } from './timeSync.js';
import { db, realtimeDb } from './firebase-config.js';
import { ref, onValue } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';  // Add this import

const timeSync = new TimeSync();

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

// Carousel content
const slides = [
    {
        image: '/images/quotes_images/3.png',
        text: 'Donating isn’t just about money—it’s about sharing your time, skills, and resources to make the world a better place. 🌍❤️'
    },
    {
        image: '/images/quotes_images/1.png',
        text: 'Sanitation and cleanliness shape communities 🌍, yet some argue they may stifle artistic expression 🎨—a fine balance between order and creativity!'
    },
    {
        image: '/images/quotes_images/2.png',
        text: 'Helping others is the rent we pay for our time on this earth 🌎❤️. The more we give, the richer our lives become!'
    },
    {
        image: '/images/quotes_images/4.png',
        text: 'Every time a woman stands up for herself 💪✨, she empowers all women, paving the way for strength, courage, and change! 👑❤️'
    },
    {
        image: '/images/quotes_images/5.png',
        text: 'Planting a tree 🌳 is more than just gardening—it’s bringing dreams of a better world to life, one root at a time 🌍💚.'
    },
    {
        image: '/images/quotes_images/6.png',
        text: 'We do our best within our world’s limits 🌎, striving for justice ⚖️—the foundation of society, just as truth fuels every great idea 💡.'
    },
    {
        image: '/images/quotes_images/7.png',
        text: 'True service isn’t about money 💰—it’s about giving with sincerity and integrity ❤️🤝, the priceless gifts that truly make a difference.'
    },
    {
        image: '/images/quotes_images/9.png',
        text: 'Diversity brings people together 🌍, but inclusion makes it work 🤝❤️. True unity comes from embracing differences and moving forward together!'
    },
    {
        image: '/images/quotes_images/8.png',
        text: 'Sustainable development is building for today 🌍 while protecting tomorrow 🌱—meeting our needs without harming future generations 💚.'
    },
    {
        image: '/images/quotes_images/10.png',
        text: 'Women empowerment isn’t about overpowering men 🚫—it’s about embracing womanhood 👑 and lifting others up along the way 💪✨.'
    },
    {
        image: '/images/quotes_images/11.png',
        text: 'Education is the most powerful weapon 📚✨—it transforms the world by leading us from darkness to light 🌍💡, shaping a brighter future for all.'
    },
    {
        image: '/images/quotes_images/12.png',
        text: 'Equity means recognizing different starting points 🎯⚖️ and providing the right support so everyone has a fair chance to succeed 🌍💙.'
    },
    {
        image: '/images/quotes_images/14.png',
        text: 'Diversity isn’t about our differences 🌍—it’s about celebrating each other’s uniqueness and growing stronger together 🤝❤️.'
    },
    {
        image: '/images/quotes_images/15.png',
        text: 'Mental health struggles don’t define you 💙—they are experiences, not your identity. You may walk through the rain ☔, but you are stronger than the storm 🌈.'
    },
    {
        image: '/images/quotes_images/16.png',
        text: 'Kindness and generosity 🤝❤️ create a compassionate world, easing suffering and building a community rooted in care and shared responsibility 🌍✨.'
    },
    {
        image: '/images/quotes_images/17.png',
        text: 'Our planet is burdened by plastic waste 🌍💔. Choosing reusables and reducing plastic helps protect the environment and ensure a cleaner future 🌱♻️.'
    },
    {
        image: '/images/quotes_images/18.png',
        text: 'We are all connected 🌍💞, and lifting each other up creates a stronger, more resilient community. True success is helping everyone thrive 🤝✨.'
    },
    {
        image: '/images/quotes_images/20.png',
        text: 'Volunteering is a beautiful way to give back 🤝💙. By sharing our time, skills, and resources, we don’t just help others—we help build a brighter future for everyone 🌍✨.'
    },
    {
        image: '/images/quotes_images/21.png',
        text: 'Everyone has the power to create change 🌍✨. From small kindnesses to big initiatives, we can build a just, equal world together 🤝❤️—one step at a time!'
    },
    {
        image: '/images/quotes_images/22.png',
        text: 'Costumes and masks may change 🎭🎃, but our duty to society remains. Let’s embrace awareness, respect differences, and create an inclusive world—on Halloween and beyond 🤝✨.'
    }    
];

// Initialize carousel
let currentSlide = 0;
const carousel = document.querySelector('.carousel');
const dotsContainer = document.querySelector('.dots-container');

// Create slides and dots
slides.forEach((slide, index) => {
    // Create slide
    const slideElement = document.createElement('div');
    slideElement.className = `slide ${index === 0 ? 'active' : ''}`;
    slideElement.innerHTML = `
        <img src="${slide.image}" alt="Puzzle Image ${index + 1}">
        <p>${slide.text}</p>
    `;
    carousel.appendChild(slideElement);

    // Create dot
    const dot = document.createElement('div');
    dot.className = `dot ${index === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.appendChild(dot);
});

// Enhanced navigation functions
function updateSlides() {
    document.querySelectorAll('.slide').forEach((slide, index) => {
        if (index === currentSlide) {
            slide.className = 'slide active';
        } else if (index < currentSlide || (currentSlide === 0 && index === slides.length - 1)) {
            slide.className = 'slide prev';
        } else {
            slide.className = 'slide';
        }
    });
    
    document.querySelectorAll('.dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });
}

// Enhanced slide transition
function goToSlide(index) {
    if (index === currentSlide) return;
    
    const direction = index > currentSlide ? 1 : -1;
    const slides = document.querySelectorAll('.slide');
    
    slides[currentSlide].style.transform = `translateX(${-direction * 100}%)`;
    slides[index].style.transform = `translateX(${direction * 100}%)`;
    
    requestAnimationFrame(() => {
        slides[index].style.transition = 'transform 0.5s ease-out';
        slides[currentSlide].style.transition = 'transform 0.5s ease-out';
        slides[index].style.transform = 'translateX(0)';
        slides[currentSlide].style.transform = `translateX(${direction * -100}%)`;
    });
    
    currentSlide = index;
    updateSlides();
}

// Add touch support for mobile
let touchStartX = 0;
let touchEndX = 0;

carousel.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

carousel.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            nextSlide();
        } else {
            prevSlide();
        }
    }
}

// Navigation functions
function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    updateSlides();
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateSlides();
}

// Add event listeners for navigation
document.querySelector('.next-btn').addEventListener('click', nextSlide);
document.querySelector('.prev-btn').addEventListener('click', prevSlide);

// Auto-advance slides every 5 seconds
setInterval(nextSlide, 5000);

// Enhanced timer animation
function startTimer() {
    const timerDisplay = document.getElementById('timer');
    const originalStartTime = parseInt(sessionStorage.getItem('gameStartTime'));
    const timeLimit = parseInt(sessionStorage.getItem('gameTimeLimit'));
    
    if (!originalStartTime || !timeLimit) {
        console.error('Missing timer data, redirecting to leaderboard');
        window.location.href = 'leaderboard.html';
        return;
    }

    const timerInterval = timeSync.startTimer(
        timerDisplay, 
        originalStartTime, 
        () => {
            // When timer completes
            clearInterval(timerInterval);
            window.location.href = 'leaderboard.html';
        }
    );

    return timerInterval;
}

// Start timer with existing game time
const timerInterval = startTimer();

// Clean up on page unload
window.addEventListener('unload', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
});

// Add manual continue button handler
const continueBtn = document.getElementById('continueBtn');
if (continueBtn) {
    continueBtn.addEventListener('click', () => {
        const startTime = parseInt(sessionStorage.getItem('gameStartTime'));
        const timeLimit = parseInt(sessionStorage.getItem('gameTimeLimit'));
        const now = timeSync.getServerTime();
        
        // Only allow early continue if admin enabled it
        if (sessionStorage.getItem('allowEarlyContinue') === 'true' || 
            (now - startTime >= timeLimit)) {
            window.location.href = 'leaderboard.html';
        } else {
            alert('Please wait for the timer to complete');
        }
    });
}

// Initialize with smooth loading
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    requestAnimationFrame(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    });
});

// Listen for game completion and leaderboard publication
function listenForGameCompletion() {
    const gameStateRef = ref(realtimeDb, 'gameState');
    onValue(gameStateRef, async (snapshot) => {
        const gameState = snapshot.val();
        if (!gameState) return;

        try {
            // If leaderboard is published, go directly to leaderboard
            if (gameState.leaderboardPublished) {
                window.location.href = 'leaderboard.html';
                return;
            }

            // Get the latest completion count
            const completionsRef = collection(db, 'completions');
            const completionsSnapshot = await getDocs(completionsRef);
            const finishedCount = completionsSnapshot.docs.length;

            // If all players finished, go to waiting_leaderboard
            if (finishedCount >= gameState.totalPlayers) {
                console.log('All players finished, redirecting to waiting_leaderboard');
                window.location.href = 'waiting_leaderboard.html';
            }
        } catch (error) {
            console.error('Error checking completions:', error);
        }
    });
}

// Add this after existing imports
function setupResetListener() {
    const resetRef = ref(realtimeDb, 'systemState/reset');
    onValue(resetRef, (snapshot) => {
        const resetData = snapshot.val();
        if (resetData?.action === 'reset') {
            alert('System reset initiated. Thank you for participating!');
            window.location.replace('/thankyou.html');
        }
    });
}

// Initialize listeners
document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    listenForGameCompletion();
    setupResetListener();
});
