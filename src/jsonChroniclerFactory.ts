import {BaseChroniclerFactory, IChronicler, IChroniclerDescription} from '@curium.rocks/data-emitter-base';
import { isRotationOptions, JsonChronicler, JsonChroniclerOptions, RotationOptions } from './jsonChronicler';

/**
 * 
 */
export class JsonChroniclerFactory extends BaseChroniclerFactory {

    /**
     * Create a json chronicler
     * @param {IChroniclerDescription} description 
     * @return {Promise<IChronicler>}
     */
    buildChronicler(description: IChroniclerDescription): Promise<IChronicler> {
        const props = description.chroniclerProperties as Record<string, unknown>;
        if (!props.logDirectory) return Promise.reject(new Error("Missing required logDirectory property for JsonChronicler"));
        if (!props.logName) return Promise.reject(new Error("Missing required logName property for JsonChronicler"));
        if (!props.rotationSettings) return Promise.reject(new Error("Missing required rotationSettings property for JsonChronicler"));
        if (!(isRotationOptions(props.rotationSettings))) return Promise.reject(new Error("rotationSettings does not conform to RotationOptions interface"));
        const options: JsonChroniclerOptions = {
            name: description.name,
            description: description.description,
            id: description.id,
            logger: this.loggerFacade,
            logDirectory: props.logDirectory as string,
            logName: props.logName as string,
            rotationSettings: props.rotationSettings as RotationOptions
        };
        const chronicler: JsonChronicler = new JsonChronicler(options);
        return Promise.resolve(chronicler);
    }

}