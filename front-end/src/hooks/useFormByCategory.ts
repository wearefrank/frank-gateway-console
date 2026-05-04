import {useCallback, useState} from 'react';

export function useFormByCategory(initialCategory: string) {
    const [category, setCategory] = useState(initialCategory);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [categoryValMap, setCategoryValMap] = useState<Record<string, Record<string, unknown>>>({});

    const handleChange = useCallback((name: string, value: unknown) => {
        setValues(prev => {
            if (value === undefined) {
                const {[name]: _, ...rest} = prev;
                return rest;
            }
            return {...prev, [name]: value};
        });
    }, []);

    const handleCategorySwitch = useCallback((newCategory: string) => {
        setCategoryValMap(prev => ({...prev, [category]: values}));
        setValues(categoryValMap[newCategory] ?? {});
        setCategory(newCategory);
    }, [category, values, categoryValMap]);

    const loadValues = useCallback((newValues: Record<string, unknown>) => {
        setValues(newValues);
    }, []);

    return {category, values, handleChange, handleCategorySwitch, loadValues};
}
