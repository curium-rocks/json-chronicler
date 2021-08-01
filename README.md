# Json-Chronicler
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=curium-rocks_json-chronicler&metric=alert_status)](https://sonarcloud.io/dashboard?id=curium-rocks_json-chronicler) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=curium-rocks_json-chronicler&metric=coverage)](https://sonarcloud.io/dashboard?id=curium-rocks_json-chronicler) [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=curium-rocks_json-chronicler&metric=security_rating)](https://sonarcloud.io/dashboard?id=curium-rocks_json-chronicler)

## What does it do?
This library facilitates saving records to local files in JSON format. It will 
append a record to a json file and honor chronological rotation settings. 

## How to install
`npm install --save @curium.rocks/json-chronicler`

## How do I use it?

### Setup your options

```typescript
import {JsonChroniclerOptions} from "@curium.rocks/json-chronicler";

const logOptions: JsonChroniclerOptions = {
    name: "yourLoggerName", // used for prefixing the log files
    logDirectory: "./logs", // path to your log directory
    rotationSettings: {
        days: 7,
        hours: 1,
        minutes: 5,
        milliseconds: 750
    } // sums all the properties and will rotate the logs on that interval
}
```
### Create and save a record

```typescript
import {JsonChronicler} from "@curium.rocks/json-chronicler";
import {IChronicler} from "@curium.rocks/data-emitter-base";

const chronciler: IChronicler = new JsonChronicler(logOptions);
await chronciler.saveRecord({
    toJSON: () => {
        return {
            property1: 0.123,
            property2: "blue"
        }
    }
})
```

### Make your models compatible

```typescript
import {IJsonSerializable} from "@curium.rocks/data-emitter-base";

/**
 * Example implementation of a model that could be directly passed to
 * a chronicler
 */
export class Model implements IJsonSerializable {
    private hidden = "will not be saved";
    private property1 = 0.123;
    private property2 = "blue";

    /**
     * Provide a map with the desired names and values
     * @return {Record<string, unknown>} map that will be serialized
     */
    toJSON(): Record<string, unknown> {
        return {
            desiredSavedPropName1: this.property1,
            desiredSavedPropName2: this.property2
        };
    }
}

```