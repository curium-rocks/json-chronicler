import {LoggerFacade, IRotatingFileChronicler, IJsonSerializable, IClassifier, IDataEvent, IStatusEvent, isStatusEvent, isDataEvent} from '@curium.rocks/data-emitter-base';
import fs from 'fs/promises';
import {pipeline} from 'stream/promises';
import {createWriteStream, createReadStream} from "fs";
import zlib from 'zlib';
import path from 'path';
import { BaseChronicler } from '@curium.rocks/data-emitter-base/build/src/chronicler';


export interface JsonChroniclerOptions extends IClassifier {
    logger?: LoggerFacade;
    rotationSettings: RotationOptions;
    logDirectory: string;
    logName: string;
    batchInterval?: number
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
 * Check if an object conforms to the RotationOptions interface
 * @param {unknown} options 
 * @return {boolean} 
 */
export function isRotationOptions (options: unknown) : boolean {
    if(options == null) return false;
    if(typeof options != "object") return false;
    // all properties for rotation options are nullable soooo as long as it's an object and not null
    // it conforms to the contract for now.
    return true;    
}

interface FileOperation {
    (): Promise<unknown>;
}

/**
 * Persist events to a rolling JSON file
 */
export class JsonChronicler extends BaseChronicler implements IRotatingFileChronicler {
    public static readonly TYPE: string = "JSON-CHRONICLER";

    private firstWrite = true;
    private fileHandle: fs.FileHandle|undefined;
    private currentFile: string|undefined;
    private readonly logName: string;
    private readonly rotationSettings: RotationOptions;
    private readonly logDirectory: string;
    private readonly logger: LoggerFacade|undefined;
    private readonly rotationIntervalMs: number;
    private readonly operationQueue: Array<FileOperation>;
    private readonly batchInterval: number;
    private operationTimer?: ReturnType<typeof setTimeout>;
    private operationPromise?: Promise<void>;
    private disposePromise?: Promise<void>;
    private lastRotationMs: number|undefined;
    private disposed = false;



    /**
     *
     * @param {JsonChroniclerOptions} options
     */
    constructor(options:JsonChroniclerOptions) {
        super({
            id: options.id,
            name: options.name,
            description: options.description, 
            type: JsonChronicler.TYPE,
            chroniclerProperties: options
        });
        this.logger = options.logger;
        this.rotationSettings = options.rotationSettings;
        this.logDirectory = options.logDirectory;
        this.logName = options.logName;
        this.rotationIntervalMs = getMsFromRotationOptions(options.rotationSettings);
        this.operationQueue = new Array<FileOperation>();
        this.batchInterval = options.batchInterval || 100;
        this.operationTimer = setTimeout(this.processFileOperations.bind(this), this.batchInterval);
        this._name = options.name;
        this._description = options.description;
        this._id = options.id;
    }

    /**
     * Processes file operations
     */
    private processFileOperations(): void {
        this.logger?.debug(`Executing: processFileOperations for ${this.id}`);
        this.operationPromise = new Promise(async (resolve) => {
            let operation = this.operationQueue.pop();
            while(operation != null) {
                await operation();
                operation = this.operationQueue.pop();
            }
            resolve();
            this.operationPromise = undefined;
            if(!this.disposed) {
                this.logger?.debug(`Queueing: processFileOperations for ${this.id}`);
                this.operationTimer = setTimeout(this.processFileOperations.bind(this), this.batchInterval);
            }
        });
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
     * @param {IJsonSerializable|IDataEvent|IStatusEvent} record
     * @return {Promise<void>}
     */
    public async saveRecord(record: IJsonSerializable|IDataEvent|IStatusEvent): Promise<void> {
        if(this.disposed) throw new Error("Object Disposed!");
        if(isStatusEvent(record)) this.logger?.debug('writing status event');
        if(isDataEvent(record)) this.logger?.debug('writing data event');
        return new Promise((resolveClientAwait) =>  {
            this.operationQueue.push(() : Promise<void> => {
                return new Promise(async (resolve) => {
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
                    this.firstWrite = false;
                    resolve();
                    resolveClientAwait();
                });
            });
        });
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
        this.firstWrite = true;
        return name;
    }

    /**
     * Compress a plain text log file
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
     * Compress rotated logs
     * @return {Promise<void>}
     */
    public async compactLogs(): Promise<void> {
        const logMatch = `${this.logName}.*\\.json`;
        const compressMatch = '.*\\.json.gz';

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
     * Get the filename of the active log file
     * @return {string}
     */
    public getCurrentFilename(): string {
        return this.currentFile || "N/A";
    }

    /**
     * Flushes all queued file operations to disk
     * @return {Promise<void>}
     */
    public async flush(): Promise<void> {
        if(this.operationPromise) {
            // if a ops is in progress it will flush the entire queue
            await this.operationPromise;
        } else {
            if(this.operationTimer) clearTimeout(this.operationTimer);
            // this immediatetly executes the flush and resets the timer
            this.processFileOperations();
            return this.operationPromise;
        }
    }

    /**
     * Dipose of any resources managed by the chronicler that
     * aren't automatically cleaned up
     * @return {Promise<void>}
     */
    public async disposeAsync(): Promise<void> {
        if(this.disposed) return this.disposePromise;
        this.disposed = true;

        // stop additional processing
        if(this.operationTimer) clearTimeout(this.operationTimer);


        this.disposePromise = new Promise(async (resolve) => {
            // check if we have queued items but do not have an active process loop
            if(this.operationPromise == null && this.operationQueue.length > 0) this.processFileOperations();


            // if an operation is in progress wait for the queue to be drained
            if(this.operationPromise) await this.operationPromise;

            // if we have a file handle close up the json array and close the file handle
            if(this.fileHandle) {
                await this.fileHandle.write(']');
                await this.fileHandle.close();
            }
            resolve();
        });
        return this.disposePromise;
    }

    /**
     * The type of the chronicler
     * @return {string}
     */
    getType(): string {
        return JsonChronicler.TYPE;
    }

    /**
     * Get the properties unique to this chronicler that are 
     * needed to restore it's state
     * @return {unknown}
     */
    getChroniclerProperties(): unknown {
        return {
            logDirectory: this.logDirectory,
            logName: this.logName,
            rotationSettings: this.rotationSettings,
            id: this.id,
            name: this.name,
            description: this.description
        }
    }
}