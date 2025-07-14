class Word {
    constructor(text, x, y) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.velocity = 0;
        this.acceleration = 0.02;
        this.hit = false;
        this.isWrong = false;
        this.answer = '';

        // Desired height for the asteroid
        this.desiredHeight = 250; // Even further increased height
        this.width = 0; // Will be calculated after image load
        this.height = this.desiredHeight;

        // Load asteroid images
        this.purpleAsteroid = new Image();
        this.purpleAsteroid.src = 'asteroid_purple.png';

        this.redAsteroid = new Image();
        this.redAsteroid.src = 'asteroid_red.png';
    }

    update() {
        this.y += this.velocity;
    }

    draw(ctx) {
        // Choose the image based on whether the word is wrong
        const asteroidImage = this.isWrong ? this.redAsteroid : this.purpleAsteroid;

        if (asteroidImage.complete) { // Ensure image is loaded before drawing
            // Calculate width based on desired height and image aspect ratio
            if (this.width === 0) { // Calculate width only once
                this.width = asteroidImage.naturalWidth * (this.desiredHeight / asteroidImage.naturalHeight);
                // Adjust x position so the center remains the same after width calculation
                this.x = this.x + (140/2) - (this.width/2); // 140 was the old fixed width
            }

            // Draw the asteroid image
            ctx.drawImage(asteroidImage, this.x, this.y, this.width, this.height);

            // Draw the text on top of the asteroid
            ctx.fillStyle = 'white';
            // Adjust font size based on word length and asteroid width
            let fontSize = 30; // Start with a larger base font size
            ctx.font = `${fontSize}px Arial`;
            // Reduce font size if text is too wide, with padding, ensure minimum size
            const padding = 20; // Reduce padding to allow more text space
            const minFontSize = 16; // Minimum readable font size
            while (ctx.measureText(this.text).width > this.width - padding && fontSize > minFontSize) {
                fontSize -= 1;
                ctx.font = `${fontSize}px Arial`;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Adjust text position to be centered on the asteroid, with a slight vertical offset
            const textOffsetY = -5; // Adjust this value as needed for better visual centering
            ctx.fillText(this.text, this.x + this.width/2, this.y + this.height/2 + textOffsetY);

        } else { // Draw a fallback rectangle if image isn't loaded
            ctx.fillStyle = this.isWrong ? '#ff4444' : '#2196F3';
            // Use a default size if image dimensions aren't available yet
            const defaultWidth = 140; // Fallback width
            const defaultHeight = 45; // Fallback height
            ctx.fillRect(this.x, this.y, defaultWidth, defaultHeight);

            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.text, this.x + defaultWidth/2, this.y + defaultHeight/2);
        }
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.words = [];
        this.score = 0;
        this.level = 1;
        this.gameLoop = null;
        this.spawnInterval = null;
        this.vocabulary = [];
        this.currentQuestion = null;
        this.spawnTime = 4;
        this.isPaused = false;
        this.translationDirection = 'term-to-def';
        this.isGameOver = false;
        this.baseSpeed = 1;
        this.levelThresholds = [100, 250, 500, 1000, 1750, 2750];
        this.levelSpeedIncrease = 0.2;
        
        // Get references to the new game over screen elements
        this.gameOverScreen = document.getElementById('gameOverScreen');
        this.finalScoreElement = document.getElementById('finalScore');
        this.missedWordsElement = document.getElementById('missedWords');
        this.playAgainButton = document.getElementById('playAgainButton');

        // Get reference to the settings icon and panel
        this.settingsIcon = document.getElementById('settingsIcon');
        this.settingsPanel = document.getElementById('settings');

        // Get references to new settings elements
        this.initialFallRateSlider = document.getElementById('initialFallRate');
        this.initialFallRateValueSpan = document.getElementById('initialFallRateValue');
        this.initialFallRate = parseFloat(this.initialFallRateSlider.value); // Initialize from slider value

        // Get reference to the scoreboard
        this.scoreBoard = document.getElementById('scoreBoard');

        this.setupCanvas();
        this.setupEventListeners();
        this.loadDefaultVocabulary();
    }

    setupCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    setupEventListeners() {
        document.getElementById('startButton').addEventListener('click', () => {
            if (this.isGameOver) {
                this.startGame();
            } else if (this.isPaused) {
                this.resumeGame();
            } else if (!this.gameLoop) {
                this.startGame();
            } else {
                this.pauseGame();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();

                if (this.isGameOver) {
                    // If game is over, hide the game over screen
                    this.gameOverScreen.classList.add('hidden');
                    console.log('Escape pressed during game over, hiding game over screen.');
                    return; // Exit the handler
                }

                // If settings are open, close them
                if (this.settingsPanel.classList.contains('active')) {
                    this.settingsPanel.classList.remove('active');
                    console.log('Escape pressed, closing settings panel.');
                    return; // Exit the handler
                }

                // Otherwise, handle pause/resume
                if (this.gameLoop) { // Check if game is running
                    if (this.isPaused) {
                        this.resumeGame();
                    } else { // If not paused, but gameLoop is running, then pause it
                        this.pauseGame();
                    }
                }
            }
        });

        document.getElementById('answerInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.checkAnswer();
        });
        document.getElementById('csvFileInput').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('textInput').addEventListener('input', (e) => this.handleTextInput(e));
        document.getElementById('spawnTime').addEventListener('input', (e) => {
            this.spawnTime = parseFloat(e.target.value);
            document.getElementById('spawnTimeValue').textContent = this.spawnTime;
        });
        document.getElementById('initialFallRate').addEventListener('input', (e) => {
            this.initialFallRate = parseFloat(e.target.value);
            this.initialFallRateValueSpan.textContent = this.initialFallRate;
        });
        document.getElementById('translationDirection').addEventListener('change', (e) => {
            this.translationDirection = e.target.value;
            console.log('Translation direction changed to:', this.translationDirection);
            // Re-process vocabulary based on the new direction
            if (document.getElementById('textInput').value) {
                this.parseCSV(document.getElementById('textInput').value);
            } else {
                // If no text input, reload default vocab in new direction
                this.loadDefaultVocabulary();
            }

            console.log('Vocabulary after direction change (first 5 pairs):', this.vocabulary.slice(0, 5));

            // Clear existing words and spawn a new one if game is active
            this.words = []; // Clear falling words
            // Clear the canvas immediately
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (!this.isGameOver && !this.isPaused && this.vocabulary.length > 0) {
                console.log('Spawning new word after direction change.');
                this.spawnWord(); // Spawn a new word with the correct direction
            } else if (this.isPaused) {
                // If paused, just clear words and update question text
                if (this.vocabulary.length > 0) {
                    const randomPair = this.vocabulary[Math.floor(Math.random() * this.vocabulary.length)];
                    this.currentQuestion = randomPair;
                    console.log('Updated question text while paused.', this.currentQuestion);
                }
            }
        });

        // Add restart button handler
        document.getElementById('restartButton').addEventListener('click', () => {
            this.restartGame();
        });

        // Add click handler for the new Play Again button
        this.playAgainButton.addEventListener('click', () => {
            this.startGame();
        });

        // Add click handler for the settings icon
        this.settingsIcon.addEventListener('click', () => {
            this.settingsPanel.classList.toggle('active');
        });

        // Add click handler to close settings when clicking outside
        document.addEventListener('click', (e) => {
            const settingsPanel = document.getElementById('settings');
            const settingsIcon = document.getElementById('settingsIcon');
            // Check if the clicked element is outside the settings panel and not the settings icon
            if (!settingsPanel.contains(e.target) && e.target !== settingsIcon && settingsPanel.classList.contains('active')) {
                settingsPanel.classList.remove('active');
            }
        });
    }

    loadDefaultVocabulary() {
        console.log('Loading default vocabulary...', this.translationDirection);
        // Always store default vocabulary internally as term, definition
        const defaultPairs = [
            ['hello', 'hola'],
            ['goodbye', 'adios'],
            ['thank you', 'gracias'],
            ['please', 'por favor'],
            ['yes', 'si'],
            ['no', 'no']
        ];
        // Process for the current translation direction upon loading
        this.vocabulary = this.translationDirection === 'term-to-def' ? defaultPairs : defaultPairs.map(([term, def]) => [def, term]);
        console.log('Default vocabulary loaded:', this.vocabulary.slice(0, 5));
    }

    startGame() {
        // Clear any existing game state
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
        }
        
        this.score = 0;
        this.level = 1;
        this.words = [];
        this.isPaused = false;
        this.isGameOver = false;
        
        // Hide game over screen and show canvas
        this.gameOverScreen.classList.add('hidden');
        this.canvas.classList.remove('hidden');

        // Reset speed multiplier logic to use base speed and level
        this.updateScore(); // Update score and level display, potentially trigger level 1 speed
        this.spawnWord();
        this.gameLoop = requestAnimationFrame(() => this.update());
        this.spawnInterval = setInterval(() => this.spawnWord(), this.spawnTime * 1000);
        document.getElementById('startButton').textContent = 'Pause Game';
        document.getElementById('restartButton').style.display = 'inline-block';
        document.getElementById('answerInput').disabled = false;
        document.getElementById('answerInput').focus();
    }

    restartGame() {
        // Clear game state but keep vocabulary
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
        }
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
        }
        
        this.score = 0;
        this.level = 1; // Reset level on restart
        this.words = [];
        this.isPaused = false;
        this.isGameOver = false;
        // Reset speed multiplier logic to use base speed and level
        this.updateScore(); // Update score and level display, potentially trigger level 1 speed
        this.spawnWord();
        this.gameLoop = requestAnimationFrame(() => this.update());
        this.spawnInterval = setInterval(() => this.spawnWord(), this.spawnTime * 1000);
        document.getElementById('startButton').textContent = 'Pause Game';
        document.getElementById('restartButton').style.display = 'inline-block';
        document.getElementById('answerInput').disabled = false;
        document.getElementById('answerInput').focus();
        
        // Clear the canvas and hide game over screen
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.gameOverScreen.classList.add('hidden');
        this.canvas.classList.remove('hidden');
    }

    spawnWord() {
        if (this.vocabulary.length === 0) {
            console.log('Cannot spawn word: Vocabulary is empty.');
            return;
        }
        
        // Select a random pair from the current vocabulary (already in the correct direction)
        const randomPair = this.vocabulary[Math.floor(Math.random() * this.vocabulary.length)];
        
        // Spawn within a buffer of the canvas width
        const spawnBuffer = 50; // Pixels from each side to avoid spawning too close to edges
        const maxX = Math.max(0, this.canvas.width - spawnBuffer * 2);
        const x = Math.random() * maxX + spawnBuffer;

        // Spawn word with a negative Y position, offset by scoreboard height plus an extra buffer
        const extraOffsetY = 50; // Adjust this value to increase or decrease the starting height above the scoreboard
        const initialY = -this.scoreBoard.offsetHeight - extraOffsetY;
        const word = new Word(randomPair[0], x, initialY);
        // Set word velocity based on initial fall rate and current level speed
        word.velocity = this.initialFallRate + ((this.level - 1) * this.levelSpeedIncrease);
        word.answer = randomPair[1];
        this.words.push(word);
        this.currentQuestion = randomPair; // Keep track of the current question pair
        console.log('Spawned word:', word.text, 'Correct Answer:', word.answer, 'Question displayed:', this.currentQuestion[0]);
    }

    checkAnswer() {
        if (this.isGameOver) return;

        const input = document.getElementById('answerInput');
        const answer = input.value.toLowerCase().trim();
        console.log('User input:', input.value, 'Trimmed and lowercased answer:', answer);
        
        // Remove accents and special characters for comparison
        const normalizeText = (text) => {
            return text.normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
        };

        const normalizedAnswer = normalizeText(answer);
        console.log('Normalized user answer:', normalizedAnswer);
        
        let wordsToRemove = [];
        let correctAnswerFound = false;

        console.log('Checking against words:', this.words.map(word => word.text));

        // Check all words currently falling
        this.words.forEach(word => {
            const normalizedCorrect = normalizeText(word.answer);
            console.log('Checking word:', word.text, 'with answer:', word.answer, 'Normalized correct answer:', normalizedCorrect);
            if (normalizedAnswer === normalizedCorrect) {
                console.log('Match found for word:', word.text);
                wordsToRemove.push(word);
                this.score += 10; // Increase score for each correct word found
                correctAnswerFound = true;
            }
        });

        console.log('Words to remove:', wordsToRemove.map(word => word.text));
        console.log('Words before filter:', this.words.map(word => word.text));

        // Remove all identified words
        this.words = this.words.filter(word => !wordsToRemove.includes(word));

        console.log('Words after filter:', this.words.map(word => word.text));

        // Only update score display once after checking all words
        if (correctAnswerFound) {
            this.updateScore();
        }

        // If no correct answer was found for any falling word, mark the current question word as wrong
        // Only mark wrong if an answer was actually typed and it didn't match any word
        if (!correctAnswerFound && answer !== '') {
            const currentWord = this.words.find(w => w.text === this.currentQuestion[0]);
            if (currentWord) {
                currentWord.isWrong = true;
                console.log('Marking current question word as wrong:', currentWord.text);
            }
        }
        
        input.value = '';
        console.log('Answer input cleared.');
    }

    updateScore() {
        document.getElementById('score').textContent = this.score;
        
        // Check for level up
        if (this.level - 1 < this.levelThresholds.length && this.score >= this.levelThresholds[this.level - 1]) {
            this.levelUp();
        }

        document.getElementById('level').textContent = this.level;
    }

    levelUp() {
        this.level++;
        document.getElementById('level').textContent = this.level;
        
        // Increase speed of existing words
        const currentSpeed = this.baseSpeed + ((this.level - 1) * this.levelSpeedIncrease);
        this.words.forEach(word => {
            word.velocity = currentSpeed;
        });

        // Pause briefly and show level up message
        this.pauseGame(true); // Pause without toggling button text
        this.ctx.fillStyle = 'white';
        this.ctx.font = '72px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`Level ${this.level}!`, this.canvas.width/2, this.canvas.height/2);

        // Resume game after a delay
        setTimeout(() => {
            this.resumeGame(true); // Resume without toggling button text
        }, 2000); // Pause for 2 seconds
    }

    pauseGame(isLevelUp = false) {
        if (!this.gameLoop || this.isGameOver) return;
        
        this.isPaused = true;
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
            this.gameLoop = null;
        }
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
            this.spawnInterval = null;
        }
        
        if (!isLevelUp) {
            document.getElementById('startButton').textContent = 'Resume Game';
        }

        // Draw pause overlay
        if (!isLevelUp) { // Don't draw standard pause overlay during level up
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '64px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('PAUSED', this.canvas.width/2, this.canvas.height/2);
            this.ctx.font = '32px Arial';
            this.ctx.fillText('Press ESC or click Resume to continue', this.canvas.width/2, this.canvas.height/2 + 60);
        }
    }

    resumeGame(isLevelUp = false) {
        if (!this.isPaused) return;
        
        this.isPaused = false;
        if (!isLevelUp) {
            this.gameLoop = requestAnimationFrame(() => this.update());
            this.spawnInterval = setInterval(() => this.spawnWord(), this.spawnTime * 1000);
            document.getElementById('startButton').textContent = 'Pause Game';
        } else { // If resuming after level up pause, restart game loop and spawn immediately
            this.gameLoop = requestAnimationFrame(() => this.update());
            this.spawnInterval = setInterval(() => this.spawnWord(), this.spawnTime * 1000);
        }
       
        // Clear any level up message or pause overlay
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    update() {
        console.log('update loop running. isPaused:', this.isPaused, 'isGameOver:', this.isGameOver);
        if (this.isPaused || this.isGameOver) {
            console.log('Update loop stopping due to pause or game over.');
            return; // Stop drawing and updating if paused or game over
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.words = this.words.filter(word => {
            word.update();
            word.draw(this.ctx);
            // Check if word has reached bottom
            if (word.y + word.height >= this.canvas.height) { // Modified condition
                console.log('Word reached bottom, calling gameOver().');
                this.gameOver();
                return false; // Remove the word that hit the bottom
            }
            return true; // Keep words that haven't hit the bottom
        });

        if (this.words.length === 0 && !this.isPaused && !this.isGameOver) {
            console.log('Words array empty, spawning new word.');
            this.spawnWord();
        }

        // Only request next frame if not game over
        if (!this.isPaused && !this.isGameOver) {
            this.gameLoop = requestAnimationFrame(() => this.update());
        } else {
            console.log('Not requesting next animation frame.', 'isPaused:', this.isPaused, 'isGameOver:', this.isGameOver);
        }
    }

    gameOver() {
        console.log('gameOver function called');
        this.isGameOver = true;
        // Stop the game loop and spawning
        console.log('Attempting to cancel animation frame and clear spawn interval.');
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
            this.gameLoop = null;
            console.log('Animation frame cancelled.');
        }
        if (this.spawnInterval) {
            clearInterval(this.spawnInterval);
            this.spawnInterval = null;
            console.log('Spawn interval cleared.');
        }

        // Store missed words before clearing the array (for display in HTML)
        const missedWordsList = this.words.map(word => {
            const pair = this.vocabulary.find(p => p[0] === word.text || p[1] === word.text);
            if (pair) {
                const [term, def] = pair;
                return this.translationDirection === 'term-to-def' 
                    ? `${term} → ${def}`
                    : `${def} → ${term}`;
            }
            return null;
        }).filter(Boolean);
        console.log('Stored missed words for HTML display:', missedWordsList);

        // Clear all falling words (no longer strictly necessary for visual, but good practice)
        this.words = [];
        console.log('Words array cleared.');

        // Hide canvas and show game over screen HTML element
        this.canvas.classList.add('hidden');
        this.gameOverScreen.classList.remove('hidden');

        // Populate game over screen with info
        this.finalScoreElement.textContent = `Final Score: ${this.score}`;
        this.missedWordsElement.innerHTML = ''; // Clear previous missed words
        if (missedWordsList.length > 0) {
            const heading = document.createElement('h3');
            heading.textContent = 'Missed Words:';
            this.missedWordsElement.appendChild(heading);
            missedWordsList.forEach(wordText => {
                const p = document.createElement('p');
                p.textContent = wordText;
                this.missedWordsElement.appendChild(p);
            });
        }

        // Update UI elements for game over (buttons will be hidden by overlay)
        document.getElementById('startButton').textContent = 'Start Game'; // Reset button text
        document.getElementById('restartButton').style.display = 'none';
        document.getElementById('answerInput').disabled = true;
        console.log('UI elements updated for game over.');

        console.log('gameOver function finished.');
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => this.parseCSV(e.target.result);
            reader.readAsText(file);
        }
    }

    handleTextInput(event) {
        this.parseCSV(event.target.value);
    }

    parseCSV(text) {
        const delimiter = document.getElementById('delimiter').value;
        const rows = text.split('\n');
        // Process CSV into term, definition pairs first, regardless of desired direction
        const rawPairs = rows
            .map(row => row.split(delimiter))
            .filter(pair => pair.length === 2)
            .map(pair => pair.map(item => item.trim()));

        // Store vocabulary based on the current translation direction
        this.vocabulary = this.translationDirection === 'term-to-def' ? rawPairs : rawPairs.map(([term, def]) => [def, term]);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Game();
}); 