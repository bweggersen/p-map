'use strict';

const NO_AVAILABLE_JOBS = 'NO_AVAILABLE_JOBS';

const pMap = (iterable, mapper, options) => new Promise((resolve, reject) => {
	options = Object.assign({
		concurrency: Infinity
	}, options);

	if (typeof mapper !== 'function') {
		throw new TypeError('Mapper function is required');
	}

	const {concurrency} = options;

	if (!(typeof concurrency === 'number' && concurrency >= 1)) {
		throw new TypeError(`Expected \`concurrency\` to be a number from 1 and up, got \`${concurrency}\` (${typeof concurrency})`);
	}

	const ret = [];
	const iterator = iterable[Symbol.iterator]();
	const pausedThreads = [];
	let isRejected = false;
	let isIterableDone = false;
	let resolvingCount = 0;
	let currentIndex = 0;

	const next = (thread, index) => {
		if (isRejected) {
			return;
		}

		const nextItem = iterator.next();

		let i;
		if (index) {
			i = index;
		} else {
			i = currentIndex;
			currentIndex++;
		}

		if (nextItem.done) {
			isIterableDone = true;

			if (resolvingCount === 0) {
				resolve(ret);
			}

			return;
		}

		resolvingCount++;

		Promise.resolve(nextItem.value)
			.then(element => mapper(element, i))
			.then(
				value => {
					ret[i] = value;
					resolvingCount--;
					next(thread);

					// Start paused threads
					while (pausedThreads.length) {
						const [pausedThread, pausedIndex] = pausedThreads.shift();
						next(pausedThread, pausedIndex);
					}
				},
				error => {
					if (error === NO_AVAILABLE_JOBS) {
						pausedThreads.push([thread, i]);
						resolvingCount--;
						return;
					}

					isRejected = true;
					reject(error);
				}
			);
	};

	for (let i = 0; i < concurrency; i++) {
		next(i);

		if (isIterableDone) {
			break;
		}
	}
});

module.exports = pMap;
module.exports.default = pMap;
module.exports.NO_AVAILABLE_JOBS = NO_AVAILABLE_JOBS;
