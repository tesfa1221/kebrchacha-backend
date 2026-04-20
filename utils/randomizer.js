'use strict';

/**
 * Fisher-Yates Shuffle Algorithm
 * Ensures fair and unbiased randomization for winner selection
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array
 */
function fisherYatesShuffle(array) {
  var shuffled = array.slice(); // Create a copy
  var currentIndex = shuffled.length;
  var temporaryValue, randomIndex;

  // While there remain elements to shuffle
  while (currentIndex !== 0) {
    // Pick a remaining element
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // Swap it with the current element
    temporaryValue = shuffled[currentIndex];
    shuffled[currentIndex] = shuffled[randomIndex];
    shuffled[randomIndex] = temporaryValue;
  }

  return shuffled;
}

/**
 * Select N unique winners from an array of tickets
 * @param {Array} tickets - Array of ticket objects
 * @param {Number} count - Number of winners to select (default: 3)
 * @returns {Array} - Array of winner tickets
 */
function selectWinners(tickets, count) {
  count = count || 3;
  
  if (!tickets || tickets.length < count) {
    throw new Error('Not enough tickets to select winners');
  }

  var shuffled = fisherYatesShuffle(tickets);
  return shuffled.slice(0, count);
}

module.exports = {
  fisherYatesShuffle: fisherYatesShuffle,
  selectWinners: selectWinners
};
