
var test = require('tap').test;
var stepper = require('stepperbox')();
var proxyquire = require('proxyquire').noCallThru();
var Emitter = require('events').EventEmitter;
var Promise = require('bluebird');
var quint = proxyquire('../../', {
	mysql2: {
		createPool: stepper.as('mysql.createPool'),
	},
	'./lib/queries': {
		mockQuery: stepper.as('mockQuery'),
	},
	'./lib/promise-query': stepper.as('promiseQuery'),
});


test('bootstrapping', (t) => {
	t.plan(14);
	var opts = {
		connectionBootstrap: [
			{ sql: 'SHOW TABLES' },
		],
		ping: false,
	};
	var db = quint(opts);

	stepper.reset(true);
	stepper.add((method, options) => {
		t.equal(method, 'mysql.createPool', 'called mysql.createPool');
		t.deepEqual(options, {
			prepared: true,
			namedPlaceholders: true,
			transactionAutoRollback: true,
			retry: true,
			retryCount: 2,
			tidyStacks: true,
			connectionBootstrap: [
				{ sql: 'SHOW TABLES' },
			],
			ping: false,
		}, 'with options object');

		var pool = new Emitter();
		pool.getConnection = function (cb) {
			var conn = {
				_isMockedConnection: true,
				release: stepper.as('connection.release'),
				destroy: stepper.as('connection.destroy'),
			};
			pool.once('connection', (c) => cb(null, c));
			pool.emit('connection', conn);
		};
		pool.on('connection', stepper.as('pool.getConnection'));

		return pool;
	});

	stepper.add((method) => {
		t.equal(method, 'pool.getConnection', 'called pool.getConnection');
	});

	stepper.add((method, query) => {
		t.equal(method, 'promiseQuery', 'called promiseQuery');
		t.ok(query.connection._isMockedConnection, 'with the mocked connection');
		t.equal(query.sql, 'SHOW TABLES', 'and the bootstrap query');
		t.equal(query.values, undefined, 'and data');
		return Promise.resolve('IGNOREME');
	});

	stepper.add((method, query) => {
		t.equal(method, 'mockQuery', 'called mockQuery');
		t.ok(query.connection._isMockedConnection, 'with the mocked connection');
		t.equal(query.sql, 'QUERY', 'and the triggering query');
		t.deepEqual(query.values, { nope: true }, 'and data');
		return Promise.resolve([
			{ columnA: 1 },
		]);
	});

	stepper.add((method) => {
		t.equal(method, 'connection.release', 'called connection.release');
	});

	t.equal(stepper.getStep(), 0, 'no steps have fired yet');
	return db.mockQuery('QUERY', { nope: true })
		.then((results) => {
			t.deepEqual(results, [ { columnA: 1 } ], 'got back the expected results');
		});
});

test('bootstrapping error', (t) => {
	t.plan(10);
	var opts = {
		connectionBootstrap: [
			{ sql: 'SHOW TABLES' },
		],
		ping: false,
	};
	var db = quint(opts);

	stepper.reset(true);
	stepper.add((method, options) => {
		t.equal(method, 'mysql.createPool', 'called mysql.createPool');
		t.deepEqual(options, {
			prepared: true,
			namedPlaceholders: true,
			transactionAutoRollback: true,
			retry: true,
			retryCount: 2,
			tidyStacks: true,
			connectionBootstrap: [
				{ sql: 'SHOW TABLES' },
			],
			ping: false,
		}, 'with options object');

		var pool = new Emitter();
		pool.getConnection = function (cb) {
			var conn = {
				_isMockedConnection: true,
				release: stepper.as('connection.release'),
				destroy: stepper.as('connection.destroy'),
			};
			pool.once('connection', (c) => cb(null, c));
			pool.emit('connection', conn);
		};
		pool.on('connection', stepper.as('pool.getConnection'));

		return pool;
	});

	stepper.add((method) => {
		t.equal(method, 'pool.getConnection', 'called pool.getConnection');
	});

	stepper.add((method, query) => {
		t.equal(method, 'promiseQuery', 'called promiseQuery');
		t.ok(query.connection._isMockedConnection, 'with the mocked connection');
		t.equal(query.sql, 'SHOW TABLES', 'and the bootstrap query');
		t.equal(query.values, undefined, 'and data');
		return Promise.reject(new Error('I HURT MYSELF'));
	});

	stepper.add((method) => {
		t.equal(method, 'connection.destroy', 'called connection.destroy');
	});

	t.equal(stepper.getStep(), 0, 'no steps have fired yet');
	return db.mockQuery('QUERY', { nope: true })
		.then(
			() => t.fail('query should have failed'),
			(err) => t.equal(err.message, 'I HURT MYSELF')
		);
});

test('pool shutdown', (t) => {
	t.plan(12);
	var db = quint({ ping: false });

	stepper.reset(true);
	stepper.add((method, options) => {
		t.equal(method, 'mysql.createPool', 'called mysql.createPool');
		t.deepEqual(options, {
			prepared: true,
			namedPlaceholders: true,
			transactionAutoRollback: true,
			retry: true,
			retryCount: 2,
			tidyStacks: true,
			connectionBootstrap: null,
			ping: false,
		}, 'with options object');

		var pool = new Emitter();
		pool.getConnection = function (cb) {
			var conn = {
				_isMockedConnection: true,
				release: stepper.as('connection.release'),
				destroy: stepper.as('connection.destroy'),
			};
			pool.once('connection', (c) => cb(null, c));
			pool.emit('connection', conn);
		};
		pool.end = stepper.as('pool.end');
		pool.on('connection', stepper.as('pool.getConnection'));

		return pool;
	});

	stepper.add((method) => {
		t.equal(method, 'pool.getConnection', 'called pool.getConnection');
	});

	stepper.add((method, query) => {
		t.equal(method, 'mockQuery', 'called mockQuery');
		t.ok(query.connection._isMockedConnection, 'with the mocked connection');
		t.equal(query.sql, 'QUERY', 'and the triggering query');
		t.deepEqual(query.values, { nope: true }, 'and data');
		return Promise.reject(new Error('I HURT MYSELF'));
	});

	stepper.add((method) => {
		t.equal(method, 'connection.release', 'called connection.release');
	});

	stepper.add((method, cb) => {
		t.equal(method, 'pool.end', 'called pool.end');
		cb();
	});

	t.equal(stepper.getStep(), 0, 'no steps have fired yet');
	return db.mockQuery('QUERY', { nope: true })
		.then(
			() => t.fail('query should have failed'),
			(err) => t.equal(err.message, 'I HURT MYSELF')
		)
		.then(() => db.close())
		.then(() => {
			t.pass('pool closed');
		});
});
