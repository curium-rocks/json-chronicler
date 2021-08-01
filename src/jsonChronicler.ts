import {LoggerFacade, IRotatingFileChronicler, IJsonSerializable} from '@curium.rocks/data-emitter-base';
import fs from 'fs/promises';
import {pipeline} from 'stream/promises';
import {createWriteStream, createReadStream} from "fs";
import zlib from 'zlib';

import path from 'path';


export interface JsonChroniclerOptions {
    logger?: LoggerFacade;
    rotationSettings: RotationOptions;
    logDirectory: string;
    name: string;
}

export interface RotationOptions {
    days?: number
    hours?: number
    minutes?: number
    seconds?: number
    milliseconds?: number
    maxFileSize?: number
    maxFileCount?: number
}

/**
 *
 * @param {RotationOptions} options
 * @return {number}
 */
export function getMsFromRotationOptions (options: RotationOptions) : number {
    let total = 0;
    if(options.days) total+= options.days * 86400000;
    if(options.hours) total+= options.hours * 3600000;
    if(options.minutes) total+= options.minutes * 60000;
    if(options.seconds) total+= options.seconds * 1000;
    if(options.milliseconds) total+= options.milliseconds;
    return total;
}

/**
 * Persist events to a rolling JSON file
 */
export class JsonChronicler implements IRotatingFileChronicler {

    private firstWrite = true;
    private fileHandle: fs.FileHandle|undefined;
    private currentFile: string|undefined;
    private readonly logName: string;
    private readonly rotationSettings: RotationOptions;
    private readonly logDirectory: string;
    private readonly logger: LoggerFacade|undefined;
    private readonly rotationIntervalMs: number;
    private lastRotationMs: number|undefined;
    private disposed = false;

    /**
     *
     * @param {JsonChroniclerOptions} options
     */
    constructor(options:JsonChroniclerOptions) {
        this.logger = options.logger;
        this.rotationSettings = options.rotationSettings;
        this.logDirectory = options.logDirectory;
        this.logName = options.name;
        this.rotationIntervalMs = getMsFromRotationOptions(options.rotationSettings);
    }

    /**
     * @return {string} filename for next archive
     * @private
     */
    private generateFilename(): string {
        return `${this.logName}.${new Date().getTime()}.json`;
    }

    /**
     *
     * @param {IJsonSerializable} record
     * @return {Promise<void>}
     */
    public async saveRecord(record: IJsonSerializable): Promise<void> {
        if(this.disposed) throw new Error("Object Disposed!");
        const string = JSON.stringify(record);
        if(await this.shouldCreateFile()){
            const fileName = this.generateFilename();
            this.fileHandle = await this.createLogFile(fileName);
            this.currentFile = fileName;
            this.lastRotationMs = new Date().getTime();
        }
        if(this.shouldRotate()) {
            await this.rotateLog();
        }
        await this.fileHandle?.write(`${!this.firstWrite ? ',\n' : ''}${string}`);
    }

    /**
     * @param {string} fileName of new log file
     * @private
     */
    private async createLogFile(fileName: string) : Promise<fs.FileHandle>  {
        const filePath = path.join(this.logDirectory, fileName);
        await fs.mkdir(this.logDirectory, {
            recursive: true
        })
        const fileHandle = await fs.open(filePath, 'w');
        await fileHandle.write('[');
        return fileHandle;
    }

    /**
     *
     * @private
     */
    private async shouldCreateFile() : Promise<boolean> {
        try {
            await fs.access(path.join(this.logDirectory, this.getCurrentFilename()));
            return false;
        } catch {
            return true;
        }
    }

    /**
     *
     * @private
     * @return {boolean}
     */
    private shouldRotate() : boolean {
        // check the data extracted from the current file name and compare against
        // rotation rules
        return this.timeTillRotation() < 0;
    }

    /**
     * Gets the time since the last log file rotation in seconds
     * @return {number}
     */
    public timeSinceRotation(): number {
        const now = new Date().getTime();
        if(this.lastRotationMs == null) return now/1000;
        const timeSinceMs = now - this.lastRotationMs;
        if(timeSinceMs == 0) return 0;
        return Math.floor(timeSinceMs/1000);
    }

    /**
     * Gets the time till the next log file rotation in seconds
     * @return {number}
     */
    public timeTillRotation(): number {
        if(this.lastRotationMs == null) return Math.floor(this.rotationIntervalMs/1000);
        const now = new Date().getTime();
        const rotationTime = this.lastRotationMs + this.rotationIntervalMs;
        const timeTillRotation = rotationTime - now;
        if(timeTillRotation == 0) return 0;
        return Math.floor(timeTillRotation/1000);
    }

    /**
     * Rotates the logs and returns the new file name
     * @return {string}
     */
    public async rotateLog(): Promise<string> {
        // create a new file
        // swap the file handles
        const oldHandle = this.fileHandle;
        const name = this.generateFilename();
        this.fileHandle = await this.createLogFile(name);
        this.currentFile = name;
        await oldHandle?.write(']');
        // close the old file handle
        await oldHandle?.close();
        await this.compactLogs();
        this.lastRotationMs = new Date().getTime();
        return name;
    }

    /**
     *
     * @param {string} logName
     * @return {Promise<void>}
     * @private
     */
    private async compressLog(logName: string): Promise<void> {
        const gzip = zlib.createGzip();
        const source = createReadStream(path.join(this.logDirectory, logName));
        const destination = createWriteStream(path.join(this.logDirectory, `${logName}.gz`));
        try {
            await pipeline(source, gzip, destination);
            await fs.unlink(path.join(this.logDirectory, logName));
        } finally {
            source.close();
            gzip.close();
            destination.close();
        }
    }

    /**
     * @return {Promise<void>}
     */
    public async compactLogs(): Promise<void> {
        const logMatch = new RegExp(`${this.logName}.*\\.json`);
        const compressMatch = new RegExp('.*\\.json.gz');

        // get the list of files in the log directory without .gz
        const files = (await fs.readdir(this.logDirectory))
            // filter that list by the regex of matching names
            .filter((fileName) => fileName.match(logMatch))
            .filter((fileName) => !fileName.match(compressMatch))
            // exclude the current log from that list
            .filter((fileName) => fileName != this.currentFile);

        // call compressLog on each one of the uncompressed files that match this loggers scheme
        for(const fileName of files){
            await this.compressLog(fileName);
        }
    }

    /**
     * @return {string}
     */
    public getCurrentFilename(): string {
        return this.currentFile || "N/A";
    }

    /**
     * 
     */
    public dispose(): void {
        this.disposed = true;
        if(this.fileHandle) {
            this.fileHandle.write(']').then(()=>{
                return this.fileHandle?.close();
            })
        }
    }
}