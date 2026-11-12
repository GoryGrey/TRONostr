import assert from 'node:assert/strict';
import { ResourceDelegationDetector } from '../src/detectors/ResourceDelegationDetector';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { TronWeb } from 'tronweb';
import { createDelegationTx, OWNER_ADDRESS_HEX, RECIPIENT_ADDRESS_HEX, TEST_KIND_RANGE, withRet } from './fixtures';
import { TestCase } from './runner';

const make = (overrides = {}) => new ResourceDelegationDetector({ trxThreshold: 100000, ...overrides });

export const resourceDelegationDetectorCases: TestCase[] = [
    {
        name: 'emits a valid resource_delegation event for a large energy delegation',
        run: () => {
            const tx = createDelegationTx('DelegateResourceContract', 250000, 'ENERGY', { lock: true, lock_period: 86400 });
            const [insight, ...rest] = make().onTransaction(tx);
            assert.equal(rest.length, 0);
            assert.equal(insight.type, 'RESOURCE_DELEGATION');
            assert.equal(insight.severity, 'medium');
            assert.deepEqual(insight.content.data, {
                action: 'delegate',
                resource: 'ENERGY',
                owner: TronWeb.address.fromHex(OWNER_ADDRESS_HEX),
                receiver: TronWeb.address.fromHex(RECIPIENT_ADDRESS_HEX),
                stakedTrx: 250000,
                lock: true,
                lockPeriodBlocks: 86400,
            });
            const prepared = prepareTRONostrEvent(insight, TEST_KIND_RANGE);
            assert.equal(prepared.kind, 6503);
            assert.ok(prepared.tags.some((t) => t[1] === 'event:resource_delegation'));
        },
    },
    {
        name: 'emits undelegations and marks very large moves as high',
        run: () => {
            const [insight] = make().onTransaction(createDelegationTx('UnDelegateResourceContract', 2_000_000));
            assert.equal(insight.content.data.action, 'undelegate');
            assert.equal(insight.severity, 'high');
            assert.equal(make({ includeUndelegations: false }).onTransaction(createDelegationTx('UnDelegateResourceContract', 2_000_000)).length, 0);
        },
    },
    {
        name: 'treats a missing resource field as BANDWIDTH (protobuf default) and filters by resource',
        run: () => {
            const tx = createDelegationTx('DelegateResourceContract', 500000, null);
            const [insight] = make().onTransaction(tx);
            assert.equal(insight.content.data.resource, 'BANDWIDTH');
            assert.equal(make({ resources: ['ENERGY'] }).onTransaction(tx).length, 0);
        },
    },
    {
        name: 'ignores below-threshold and failed delegations',
        run: () => {
            assert.equal(make().onTransaction(createDelegationTx('DelegateResourceContract', 99999)).length, 0);
            assert.equal(make().onTransaction(withRet(createDelegationTx('DelegateResourceContract', 500000), 'REVERT')).length, 0);
        },
    },
];
