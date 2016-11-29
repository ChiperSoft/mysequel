
var suite = require('tapsuite');
var stepper = require('stepperbox')();
var Promise = require('bluebird');
var proxyquire = require('proxyquire').noCallThru();
var pingIdleConnections = proxyquire('../../lib/ping', {
	'./promise-query': stepper.as('promiseQuery'),
});
var quint = proxyquire('../../', {
	'./lib/promise-query': stepper.as('promiseQuery'),
});

function mockConnection (index) {
	return {
		index,
		release: stepper.as('connection.release ' + index),
		destroy: stepper.as('connection.destroy ' + index),
	};
}

suite('ping', (s) => {
	var db;
	var pool;

	s.beforeEach((done) => {
		db = quint({
			ping: {
				frequency: 0,
			},
		});

		pool = db.getPool();
		pool.query   = stepper.as('pool.query');
		pool.execute = stepper.as('pool.execute');
		pool.getConnection = stepper.as('pool.getConnection');

		stepper.reset(true);
		done();
	});

	s.afterEach(() => {
		pool._freeConnections = [];
		pool = null;
		return db.close().then(() => {
			db = null;
		});
	});

	s.test('merges ping settings correctly', (t) => {
		t.deepEqual(db.options, {
			prepared: true,
			namedPlaceholders: true,
			transactionAutoRollback: true,
			retry: true,
			retryCount: 2,
			tidyStacks: true,
			connectionBootstrap: null,
			ping: {
				frequency: 0,
				query: 'SELECT 1+1 as two;',
				expectedResult: [ { two: 2 } ],
			},
		});
		t.end();
	});

	s.test('hits all open connections and destroys bad ones', (t) => {
		t.plan(15);

		pool._freeConnections = [
			mockConnection(1),
			mockConnection(2),
			mockConnection(3),
		];

		stepper.add((method, query) => {
			t.equal(method, 'promiseQuery', 'called promiseQuery');
			t.equal(query.sql, 'SELECT 1+1 as two;', 'with the default ping query');
			t.equal(query.connection.index, 1, 'on the first connection');

			var sendBack = [ { two: 2 } ];
			sendBack.thisShouldGetRemoved = true;

			return Promise.resolve([ sendBack ]);
		});

		stepper.add((method, query) => {
			t.equal(method, 'promiseQuery', 'called promiseQuery');
			t.equal(query.sql, 'SELECT 1+1 as two;', 'with the default ping query');
			t.equal(query.connection.index, 2, 'on the second connection');

			var err = new Error('MySQL went poof');
			err.code = 'EPIPE';

			return Promise.reject(err);
		});

		stepper.add((method, query) => {
			t.equal(method, 'promiseQuery', 'called promiseQuery');
			t.equal(query.sql, 'SELECT 1+1 as two;', 'with the default ping query');
			t.equal(query.connection.index, 3, 'on the third connection');

			var sendBack = [ { two: 1 } ];
			sendBack.thisShouldGetRemoved = true;

			return Promise.resolve([ sendBack ]);
		});

		stepper.add((method) => {
			t.equal(method, 'connection.release 1', 'called connection.release on connection 1');
		});

		stepper.add((method) => {
			t.equal(method, 'connection.destroy 2', 'called connection.destroy on connection 2');
		});

		stepper.add((method) => {
			t.equal(method, 'connection.destroy 3', 'called connection.destroy on connection 3');
		});

		return pingIdleConnections(pool, db.options)
			.then((result) => {
				t.equal(result.length, 2, 'pingIdleConnections should return an array of two errors');
				t.equal(result[0].code, 'EPIPE', 'the first is an EPIPE error');
				t.equal(result[1].name, 'AssertionError', 'the second is an assertion error');
			});

	});

	s.test('does nothing if no connections are free', (t) => {

		stepper.add((method) => {
			t.fail('Something called ' + method);
		});

		return pingIdleConnections(pool, db.options)
			.then((result) => {
				t.equal(result.length, 0, 'pingIdleConnections should return an empty array');
			});
	});

});