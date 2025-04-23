import { assertEquals } from 'jsr:@std/assert@0.218.2';
import { describe, it } from 'jsr:@std/testing@0.218.2/bdd';
import { getPositionWithSuffix } from '../src/utils.ts';

describe('utils', () => {
    describe('getPositionWithSuffix', () => {
        it('should return correct suffix for 1st position', () => {
            assertEquals(getPositionWithSuffix(1), '1st');
        });

        it('should return correct suffix for 2nd position', () => {
            assertEquals(getPositionWithSuffix(2), '2nd');
        });

        it('should return correct suffix for 3rd position', () => {
            assertEquals(getPositionWithSuffix(3), '3rd');
        });

        it('should return correct suffix for other positions', () => {
            assertEquals(getPositionWithSuffix(4), '4th');
            assertEquals(getPositionWithSuffix(11), '11th');
            assertEquals(getPositionWithSuffix(21), '21st');
            assertEquals(getPositionWithSuffix(22), '22nd');
            assertEquals(getPositionWithSuffix(23), '23rd');
            assertEquals(getPositionWithSuffix(24), '24th');
        });
    });
});
