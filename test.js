import test from 'ava';
import delay from 'delay';
import inRange from 'in-range';
import timeSpan from 'time-span';
import randomInt from 'random-int';
import pMap from '.';

const input = [
	Promise.resolve([10, 300]),
	[20, 200],
	[30, 100]
];

const mapper = ([value, ms]) => delay(ms, {value});

test('main', async t => {
	const end = timeSpan();
	t.deepEqual(await pMap(input, mapper), [10, 20, 30]);
	t.true(inRange(end(), 290, 430));
});

test('concurrency: 1', async t => {
	const end = timeSpan();
	t.deepEqual(await pMap(input, mapper, {concurrency: 1}), [10, 20, 30]);
	t.true(inRange(end(), 590, 760));
});

test('concurrency: 4', async t => {
	const concurrency = 4;
	let running = 0;

	await pMap(new Array(100).fill(0), async () => {
		running++;
		t.true(running <= concurrency);
		await delay(randomInt(30, 200));
		running--;
	}, {concurrency});
});

test('handles empty iterable', async t => {
	t.deepEqual(await pMap([], mapper), []);
});

test('async with concurrency: 2 (random time sequence)', async t => {
	const input = new Array(10).map(() => randomInt(0, 100));
	const mapper = value => delay(value, {value});
	const result = await pMap(input, mapper, {concurrency: 2});
	t.deepEqual(result, input);
});

test('async with concurrency: 2 (problematic time sequence)', async t => {
	const input = [100, 200, 10, 36, 13, 45];
	const mapper = value => delay(value, {value});
	const result = await pMap(input, mapper, {concurrency: 2});
	t.deepEqual(result, input);
});

test('async with concurrency: 2 (out of order time sequence)', async t => {
	const input = [200, 100, 50];
	const mapper = value => delay(value, {value});
	const result = await pMap(input, mapper, {concurrency: 2});
	t.deepEqual(result, input);
});

test('async with concurrency: 2 (pausable threads)', async t => {
	/*
	 With `hasAvailableJob` we create a made-up scenario where the iterator
	 can't provide the next value, but the iterator is not done either. We use
	 `Promise.reject(pMap.NO_AVAILABLE_JOBS)` to communicate to pMaps that pMaps
	 should pause the thread.
	*/
	const hasAvailableJob = callCounter => callCounter !== 3;

	const dataStream = [200, 100, 75, 25];

	let callCounter = 0;
	const iterable = {
		data: dataStream,
		next() {
			callCounter++;
			return {
				done: this.data.length === 0,
				value: hasAvailableJob(callCounter) ?
					this.data.shift() :
					Promise.reject(pMap.NO_AVAILABLE_JOBS)
			};
		},
		[Symbol.iterator]() {
			return this;
		}
	};

	/*
	 Without pausable threads, thread 1 would pick up the 200 task and thread 2
	 would pick up the 100, 75 and 25 tasks.

	 With pausable threads, thread 1 will pick up the 200 task and thread 2 will
	 pick the 100 task. Then, at `callCounter === 3` there will be an interrupt
	 causing thread 2 to be paused. Thread 1 will pick up 75 and at then end of
	 its execution start thread 2 again, which will pick up the final task, 25.
	*/
	const expectedPattern = [1, 2, 1, 2];
	const actualPattern = [];

	let concurrentTasks = 0;

	await pMap(iterable, async value => {
		concurrentTasks++;
		actualPattern.push(concurrentTasks);

		await delay(value);

		concurrentTasks--;
	}, {concurrency: 2});

	t.deepEqual(actualPattern, expectedPattern);
});

test('enforce number in options.concurrency', async t => {
	await t.throwsAsync(pMap([], () => {}, {concurrency: 0}), TypeError);
	await t.throwsAsync(pMap([], () => {}, {concurrency: undefined}), TypeError);
	await t.notThrowsAsync(pMap([], () => {}, {concurrency: 1}));
	await t.notThrowsAsync(pMap([], () => {}, {concurrency: 10}));
	await t.notThrowsAsync(pMap([], () => {}, {concurrency: Infinity}));
});
