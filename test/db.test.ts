import { RangeLinearIndice } from "../src/range.linear.indice";
import { NgramIndice } from "../src/ngram.indice";
import mingo from "mingo"
import countries from "./__seed__/country-by-continent.json";
import { saveSharedIndices, restoreSharedIndices } from "../src/utils.ssr";
import { SimpleIndice } from "../src/simple.indice";
import { Db } from "../src/db";
import { Schema } from "../src/schema";


let contriesDb: Db;
beforeAll(async () => {
    const indices = new NgramIndice<number>({ gramLen: 3, actuationLimit: 2, toLowcase: true, actuationLimitAuto: true, isLoaded: false });
    countries.forEach((country, key) => indices.add(key, [country.country, country.continent]));
    const range = new RangeLinearIndice<number, string>({ indice: indices, id: 'text', chunkSize: 30 });

    const primaryIndices = new SimpleIndice<Record<string, unknown>, number>({ isLoaded: false });
    countries.forEach((country, key) => primaryIndices.add({ ...country, id: key }, key));
    const primaryRange = new RangeLinearIndice<Record<string, unknown>, number>({ indice: primaryIndices, id: 'primary', chunkSize: 30 });

    const simpleIndices = new SimpleIndice<number, string>({ isLoaded: false });
    countries.forEach((country, key) => simpleIndices.add(key, country.continent));
    const simpleRange = new RangeLinearIndice<number, string>({ indice: simpleIndices, id: 'simple', chunkSize: 30 });
    await Promise.all([
        saveSharedIndices(range),
        saveSharedIndices(primaryRange),
        saveSharedIndices(simpleRange)
    ]);
    const [primary, text, simple] = await Promise.all([
        restoreSharedIndices<number, Record<string, unknown>>(
            "primary",
            RangeLinearIndice.deserialize,
            SimpleIndice.deserialize
        ),
        restoreSharedIndices<number, string>(
            "text",
            RangeLinearIndice.deserialize,
            NgramIndice.deserialize
        ),
        restoreSharedIndices<number, string>(
            "simple",
            RangeLinearIndice.deserialize,
            SimpleIndice.deserialize
        ),
    ]);
    contriesDb = new Db(new Schema(
        'id',
        primary,
        [
            { indice: text, path: "$text" },
            { indice: simple, path: 'continent' }
        ]
    ))

});

const expectEqualMingo = async (query: any, sort: any, skip: number, count: number) => {
    const actual = await contriesDb.find(query, sort,
        skip,
        count
    )
    expect(actual.length).toBeGreaterThan(0)
    expect(actual).toEqual(new mingo.Query(query).find(actual).sort(sort).limit(count).all());
}
const expectNinMingo = async (query: any, sort: any, skip: number, count: number) => {
    const actual = await contriesDb.find<{ continent: string }>(query, sort,
        skip,
        count
    );
    const not = new Set(query['$nin'] as string[]);
    expect(actual.every((res) => !not.has(res.continent as string))).toBeTruthy()
    expect(actual).toHaveLength(51);
}
const expectLtMingo = async (query: any, sort: any, skip: number, count: number) => {
    const actual = await contriesDb.find<{ continent: string }>(query, sort,
        skip,
        count
    );
    expect(actual.every((res) => res.continent as string < "Oceania")).toBeTruthy()
    expect(actual).toHaveLength(20);
}
const expectEqMingo = async (query: any, sort: any, skip: number, count: number) => {
    const actual = await contriesDb.find<{ continent: string }>(query, sort,
        skip,
        count
    );
    expect(actual.every((res) => res.continent === "Oceania")).toBeTruthy()
    expect(actual).toHaveLength(20);
}
const expectTextMingo = async (query: any, sort: any, skip: number, count: number) => {
    const actual = await contriesDb.find<{ continent: string, country: string }>(query, sort,
        skip,
        count
    );
    expect(actual.every((res) => res.continent as string === "Africa")).toBeTruthy()
    expect(actual.every((res) => ['ang', 'Ang', 'ngo', 'gol', 'ola']
        .reduce((s, v) => res.country.includes(v) ? s + 1 : s, 0) > 2
    )
    ).toBeTruthy()
    expect(actual).toHaveLength(1);
}

// test('{ continent: { $nin: ["Oceania", "Asia", "Europe", "Antarctica", "Africa"] } }', async () => {
//     await expectNinMingo(
//         {
//             'continent': { '$nin': ["Oceania", "Asia", "Europe", "Antarctica", "Africa"] }
//         },
//         undefined,
//         0,
//         70
//     );
// });
// test('{ continent: { $eq: "Oceania" } }', async () => {
//     await expectEqMingo(
//         { 'continent': { '$eq': "Oceania" } },
//         undefined,
//         0,
//         20
//     );
// });
test('{ continent: { $lt: "Oceania" } }', async () => {
    await expectLtMingo(
        { continent: { $lt: "Oceania" } },
        undefined,
        0,
        20
    );
});
test('{ continent: { $gt: "Oceania" } }', async () => {
    await expectEqualMingo(
        { continent: { $gt: "Oceania" } },
        undefined,
        0,
        20
    );
});
test('{ id: {$lt: 10} }', async () => {
    const result = await contriesDb.find({ id: { $lt: 10 } }, undefined,
        0,
        20
    )
    expect(result).toHaveLength(10)
});
test('{ $text: "Angola", continent: "Africa" }', async () => {
    await expectTextMingo(
        { $text: "Angoli", continent: { $in: ["Africa"] } },
        undefined,
        0,
        20
    );
});
test('{ continent: "Africa" }', async () => {
    await expectEqualMingo(
        { continent: "Africa" },
        undefined,
        0,
        20
    );
});
test('{ continent: " regex Africa string" }', async () => {
    await expectEqualMingo(
        { continent: { $regex: "^Afr" } },
        undefined,
        0,
        20
    );
});
test('{ continent: " regex Africa" }', async () => {
    await expectEqualMingo(
        { continent: { $regex: /^afr/i } },
        undefined,
        0,
        20
    );
});
test('{ not: "Africa" }', async () => {
    const result = await contriesDb.find({ continent: { $regex: /^afa/i } }, undefined,
        0,
        20
    )
    expect(result).toHaveLength(0)
});
test('{ not: "Africa" }', async () => {
    const result = await contriesDb.find({ not: "Africa" }, undefined,
        0,
        20
    )
    expect(result).toHaveLength(0)
});
test('{ continent: { $gte: "Oceania" } }, { continent: 1 }', async () => {
    await expectEqualMingo(
        { continent: { $gte: "Oceania" } },
        { continent: 1 },
        0,
        20
    );
});
test('{}, { country: -1 }', async () => {
    await expectEqualMingo(
        {},
        { country: -1 },
        0,
        20
    );
});
test('{}, { continent: -1 }', async () => {
    expect(true).toEqual(new mingo.Query({ a: /^abc/ }).test({ a: 'abc' }));

});
test('{ continent: { $in: ["Oceania", "Asia"] } }', async () => {
    await expectEqualMingo(
        { continent: { $in: ["Oceania", "Asia"] } },
        { continent: 1 },
        0,
        20
    );
});




