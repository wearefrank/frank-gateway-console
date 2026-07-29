import { describe, it, expect } from 'vitest';
import { parseTemplate, tryParseTemplateValue, idValueFitsTemplate } from '../config/idTemplate';

describe('tryParseTemplateValue', () => {
    const parts = parseTemplate('{subdomain}-{service}-upstream');

    it('returns null for an empty string', () => {
        expect(tryParseTemplateValue('', parts)).toBeNull();
    });

    it('parses a value that matches the template exactly', () => {
        expect(tryParseTemplateValue('sub1-svc1-upstream', parts)).toEqual({ subdomain: 'sub1', service: 'svc1' });
    });

    it('returns null for a legacy id that does not fit the template', () => {
        expect(tryParseTemplateValue('test-test', parts)).toBeNull();
    });

    it('returns null for a value still being typed toward a match', () => {
        expect(tryParseTemplateValue('sub1-', parts)).toBeNull();
    });

    it('still matches a pill-authored value with a blank segment', () => {
        expect(tryParseTemplateValue('sub1--upstream', parts)).toEqual({ subdomain: 'sub1', service: '' });
    });
});

describe('idValueFitsTemplate', () => {
    const parts = parseTemplate('{subdomain}-{service}-upstream');
    const options = { subdomain: ['api', 'web'] };

    it('fits an empty value', () => {
        expect(idValueFitsTemplate('', parts, options)).toBe(true);
    });

    it('fits a value using a configured option', () => {
        expect(idValueFitsTemplate('api-svc1-upstream', parts, options)).toBe(true);
    });

    it('does not fit a value shaped right but using a value outside the configured options', () => {
        expect(idValueFitsTemplate('xyz-svc1-upstream', parts, options)).toBe(false);
    });

    it('does not fit a legacy id that does not match the template shape', () => {
        expect(idValueFitsTemplate('test-test', parts, options)).toBe(false);
    });

    it('fits any value for a placeholder with no configured options', () => {
        expect(idValueFitsTemplate('api-anything-upstream', parts, options)).toBe(true);
    });
});
