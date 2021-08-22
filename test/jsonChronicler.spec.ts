import { describe, it} from 'mocha';
import { expect } from 'chai';
import {getMsFromRotationOptions, JsonChronicler, JsonChroniclerOptions} from "../src/jsonChronicler";
import fs from "fs/promises";
import * as path from "path";

const LOG_DIR = './logs';

const DEFAULT_OPTIONS = {
    logDirectory: LOG_DIR,
    logName: 'test',
    rotationSettings: {
        milliseconds: 500
    },
    reservedSpacePercentage: 1,
    name: "test-name",
    description: "test-desc",
    id: "test-id"
}

const sleep = async (milliseconds:number) : Promise<void> => {
    return new Promise((resolve)=>{
        setTimeout(()=>{
            resolve();
        }, milliseconds);
    })
}

const getOptions = (logName:string): JsonChroniclerOptions =>  {
    return {
        logDirectory: './logs',
        logName: logName,
        rotationSettings: {
            seconds: 500
        },
        name: "test-name",
        description: "test-desc",
        id: "test-id"
    }
}

describe('getMsFromRotationOptions()', function(){
    it('should sum everything', function() {
        const result = getMsFromRotationOptions({
            days: 2, // 2 * 24 * 60 * 60 * 1000 = 172800000
            hours: 3, // 3 * 60 * 60 * 1000 = 10800000
            minutes: 20, // 20 * 60 * 1000 = 1200000
            seconds: 3, // 3 * 1000
            milliseconds: 21 // 21
        });
        expect(result).to.be.eq(
            (2 * 24 * 60 * 60 * 1000) +
            (3 * 60 * 60 * 1000) +
            (20 * 60 * 1000) +
            (3 * 1000) +
            21
        )
    })
    it('should convert optionals correctly', function() {
        const daysResult = getMsFromRotationOptions({
            days: 7
        })
        expect(daysResult).to.be.eq(7*24*60*60*1000);
        const hoursResult = getMsFromRotationOptions({
            hours: 12
        });
        expect(hoursResult).to.be.eq(12*60*60*1000);
        const msResult = getMsFromRotationOptions({
            milliseconds: 1500
        });
        expect(msResult).to.be.eq(1500);
    })
})
describe( 'JsonChronicler', function() {
    describe('saveRecord()', function () {
        it('should persist data to store', async function(){
            const chronicler = new JsonChronicler(getOptions("saveRecordTest"));
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "id": "test",
                            "data": "test"
                        }
                    }
                })
                const fileName = chronicler.getCurrentFilename();
                const statResult = await fs.stat(path.join(LOG_DIR, fileName));
                expect(statResult.isFile()).to.be.true;
                expect(statResult.size).to.be.gt(0);
            } finally {
                chronicler.dispose();
            }
        })
    });
    describe('compact()', function() {
        it('should compress any plain text records', async function() {
            // make a file that should be compressed
            const fileName = `compactTest.${Math.random()}.json`;
            await fs.writeFile(path.join(LOG_DIR, fileName), 'test');
            const chronicler = new JsonChronicler(getOptions('compactTest'));
            try {
                await chronicler.compactLogs();
                const statResult = await fs.stat(path.join(LOG_DIR, fileName + '.gz'));
                expect(statResult.isFile());
                const oldFile = await fs.stat(path.join(LOG_DIR))
                expect(oldFile.isFile()).to.be.false;
            } finally {
                chronicler.dispose();
            }
        })
        it('should not compress logs for other chroniclers', async function() {
            const chronicler = new JsonChronicler(getOptions('compactSepTest'));
            try {
                // create a file that matches our log name
                const fileName = `compactSepTest.${Math.random()}.json`;
                await fs.writeFile(path.join(LOG_DIR, fileName), 'test');
                // create a file that does not match our log name
                const nonMatchingFile = `compactSep2Test.${Math.random()}.json`;
                await fs.writeFile(path.join(LOG_DIR, nonMatchingFile), 'test');
                // compact
                await chronicler.compactLogs();
                // verify only the matching logName is impacted
                const statResult = await fs.stat(path.join(LOG_DIR, nonMatchingFile));
                expect(statResult.isFile()).to.be.true;
            } finally {
                chronicler.dispose();
            }
        })
    })
    describe('rotateLog()', function() {
        it('should force a log rotation', async function() {
            const chronicler = new JsonChronicler(getOptions("rotationTest"));
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test",
                            "test2": "test"
                        }
                    }
                });
                // verify the first file is in place
                const firstName = chronicler.getCurrentFilename();
                const statResult = await fs.stat(path.join(LOG_DIR, firstName));
                expect(statResult.isFile()).to.be.true;
                await sleep(250);
                // rotate the file
                await chronicler.rotateLog();
                const secondName = chronicler.getCurrentFilename();

                // verify new file
                expect(secondName).to.not.be.eq(firstName);
                const secondStat = await fs.stat(path.join(LOG_DIR, secondName));
                expect(secondStat.isFile()).to.be.true;

                // verify old file is compressed
                const compressedStat = await fs.stat(path.join(LOG_DIR, firstName + '.gz'));
                expect(compressedStat.isFile()).to.be.true;

            } finally {
                chronicler.dispose();
            }
        })
    })
    describe('timeSinceRotation()', function() {
        it('should return the seconds since last rotation', async function(){
            const options = getOptions('timeSinceRotation');
            const ms = getMsFromRotationOptions(options.rotationSettings);
            const chronicler = new JsonChronicler(options);
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": 0.123
                        }
                    }
                });
                await chronicler.rotateLog();
                expect(chronicler.timeSinceRotation()).to.be.eq(0);
                await sleep(1100);
                expect(chronicler.timeSinceRotation()).to.be.eq(1);

            } finally {
                chronicler.dispose();
            }
        })
    });
    describe('timeTillRotation()', function() {
        it('should return the seconds till the next rotation', async function() {
            const options = getOptions('timeTillRotation');
            const seconds = Math.floor(getMsFromRotationOptions(options.rotationSettings)/1000);
            const chronicler = new JsonChronicler(options);
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": 0.123
                        }
                    }
                });
                const tillSeconds = chronicler.timeTillRotation();
                expect(chronicler.timeTillRotation()).to.be.closeTo(seconds, 2)
                await sleep(500);
                expect(chronicler.timeTillRotation()).to.be.closeTo(seconds-1, 2);
                await chronicler.rotateLog();
                expect(chronicler.timeTillRotation()).to.be.closeTo(seconds, 2);

            } finally {
                chronicler.dispose();
            }
        });
    });
    describe('automaticRotation', function() {
        it('should rotate files at the next write when time has expired', async function() {
            this.timeout(5000);
            const options = getOptions("timedRotationTest");
            options.rotationSettings.seconds = 1;
            options.rotationSettings.milliseconds = 250;
            const chronicler = new JsonChronicler(options);
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test",
                            "test2": "test"
                        }
                    }
                });
                // verify the first file is in place
                const firstName = chronicler.getCurrentFilename();
                const statResult = await fs.stat(path.join(LOG_DIR, firstName));
                expect(statResult.isFile()).to.be.true;

                // wait for rotation time
                await sleep(3500);
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test"
                        }
                    }
                });
                const rotatedFile = chronicler.getCurrentFilename();
                expect(rotatedFile).to.not.be.eq(firstName);
                const rotatedStat = await fs.stat(path.join(LOG_DIR, rotatedFile));
                expect(rotatedStat.isFile()).to.be.true;

                // verify old file is compressed
                const compressedStat = await fs.stat(path.join(LOG_DIR, firstName + '.gz'));
                expect(compressedStat.isFile()).to.be.true;

            } finally {
                chronicler.dispose();
            }
        })
    })
    describe('savedFiles', function () {
        it('should be deserializable array', async function() {
            const chronicler = new JsonChronicler(getOptions("deserializeTest"));
            let fileName: string;
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test"
                        }
                    }
                });
                fileName = chronicler.getCurrentFilename();
            } finally {
                chronicler.dispose();
            }
            const fileContents = await fs.readFile(path.join(LOG_DIR, fileName), {
                encoding: "utf8"
            });
            const result = JSON.parse(fileContents);
            expect(result).to.not.be.null;
            expect(Array.isArray(result)).to.be.true;
            expect(result[0].test).to.eq("test");
        })
    });
    describe('dispose()', function() {
        it( 'should close file', async function() {
            const chronicler = new JsonChronicler(getOptions("disposeTest"));
            let fileName: string;
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test"
                        }
                    }
                });
                fileName = chronicler.getCurrentFilename();
            } finally {
                chronicler.dispose();
            }
            await sleep(500);
            let err:Error|null = null;
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test"
                        }
                    }
                });
            } catch (e) {
                err = e;
            }
            expect(err).to.not.be.null;

        })
    });
    describe('getCurrentFileName()', function() {
        it('should return a filename once written to', async function() {
            const chronicler = new JsonChronicler(DEFAULT_OPTIONS);
            try {
                await chronicler.saveRecord({
                    toJSON(): Record<string, unknown> {
                        return {
                            "test": "test"
                        }
                    }
                })
                const fileName = chronicler.getCurrentFilename();
                expect(fileName).to.match(new RegExp(`${DEFAULT_OPTIONS.logName}\\.\\d*\\.json`));
            } finally {
                chronicler.dispose();
            }
        })
        it('Should return N/A if not written to', async function() {
            const chronicler = new JsonChronicler(DEFAULT_OPTIONS);
            try {
                const fileName = chronicler.getCurrentFilename();
                expect(fileName).to.be.eq('N/A');
            } finally {
                chronicler.dispose();
            }
        })
    })
});