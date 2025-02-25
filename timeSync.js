export class TimeSync {
    constructor() {
        this.timeLimit = 5 * 60 * 1000; // 5 minutes in milliseconds
    }

    formatTime(milliseconds) {
        if (!milliseconds) return '0:00';
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    getRemainingTime(startTime) {
        const now = Date.now();
        return Math.max(0, this.timeLimit - (now - startTime));
    }

    startTimer(timerElement, startTime, onComplete) {
        // Add null check for timer element
        if (!timerElement) return null;

        let timerInterval = setInterval(() => {
            const remaining = this.getRemainingTime(startTime);
            
            if (remaining <= 0) {
                clearInterval(timerInterval);
                if (timerElement) timerElement.textContent = '0:00';
                if (onComplete) onComplete();
                return;
            }

            if (timerElement) timerElement.textContent = this.formatTime(remaining);

            // Add warning class for last minute
            if (remaining <= 60000) {
                timerElement.classList.add('warning');
            }
        }, 100);

        return timerInterval;
    }
}
