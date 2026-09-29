import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function run() {
  try {
    // 1. Delete all currently inserted subtypes for Radiology categories to start fresh
    // The categories are: 'Ultrasound', 'Doppler study', 'CT scan', 'MRI scan', 'Special radiographic procedures', 'Guided procedures (CT / USG)', 'Emergencies'
    await db.execute(sql.raw(`
      DELETE FROM department_catalog 
      WHERE department_id IN (18, 19) 
      AND kind = 'clinical_work_subtype'
      AND parent_value IN (
        'Ultrasound', 'Doppler study', 'CT scan', 'MRI scan', 'Special radiographic procedures', 'Guided procedures (CT / USG)', 'Emergencies'
      )
    `));
    
    // 2. We will now re-insert them with value = parent_value + ' - ' + name
    // This guarantees uniqueness across the whole table.
    const catalog = [
      ['Abdomen', 'Ultrasound'],
      ['KUB (Kidney, Ureter, Bladder)', 'Ultrasound'],
      ['Obstetrics', 'Ultrasound'],
      ['Musculoskeletal', 'Ultrasound'],
      ['Neurosonogram', 'Ultrasound'],
      ['Cardiovascular', 'Ultrasound'],
      ['Small Parts', 'Ultrasound'],
      
      ['Peripheral Arterial Doppler', 'Doppler study'],
      ['Peripheral Venous Doppler', 'Doppler study'],
      ['Renal Doppler', 'Doppler study'],
      ['Other Abdominal Doppler', 'Doppler study'],
      ['Neck Vessel Carotid Doppler', 'Doppler study'],
      ['Testicular Doppler', 'Doppler study'],
      ['AV Fistula Mapping', 'Doppler study'],
      
      ['Brain', 'CT scan'],
      ['Head Neck and PNS', 'CT scan'],
      ['Heart', 'CT scan'],
      ['Spine', 'CT scan'],
      ['Musculoskeletal', 'CT scan'],
      ['Abdomen', 'CT scan'],
      ['Thorax', 'CT scan'],
      ['CT Angiogram', 'CT scan'],
      ['CT Cisternography', 'CT scan'],
      ['Trauma Protocol', 'CT scan'],
      
      ['Brain', 'MRI scan'],
      ['Spine', 'MRI scan'],
      ['Abdomen', 'MRI scan'],
      ['MRCP', 'MRI scan'],
      ['MR Urogram', 'MRI scan'],
      ['MSK', 'MRI scan'],
      ['Thorax', 'MRI scan'],
      ['Heart', 'MRI scan'],
      ['MR Angio', 'MRI scan'],
      ['MR Fistulogram', 'MRI scan'],
      ['MR Fetal and Placenta', 'MRI scan'],
      
      ['Intravenous Urography (IVU)', 'Special radiographic procedures'],
      ['Micturating Cystourethrography (MCU)', 'Special radiographic procedures'],
      ['Retrograde Urethrography (RGU)', 'Special radiographic procedures'],
      ['Hysterosalpingography (HSG)', 'Special radiographic procedures'],
      ['Gastrointestinal Tract (GIT) Barium Studies', 'Special radiographic procedures'],
      ['Dacryocystography (DCG)', 'Special radiographic procedures'],
      ['Sinogram & Fistulogram', 'Special radiographic procedures'],
      
      ['CT Guided Biopsy', 'Guided procedures (CT / USG)'],
      ['USG Guided Biopsy', 'Guided procedures (CT / USG)'],
      ['USG Guided FNAC', 'Guided procedures (CT / USG)'],
      ['USG Guided Ascitic Fluid and Pleural Tap', 'Guided procedures (CT / USG)'],
      ['USG Guided Drainage Tube Placement', 'Guided procedures (CT / USG)'],
      ['Guided Abscess Drainage', 'Guided procedures (CT / USG)'],
      
      ['Abdominal', 'Emergencies'],
      ['Obstetric', 'Emergencies'],
      ['Cardiovascular', 'Emergencies'],
      ['Thoracic', 'Emergencies'],
      ['Head and Neck', 'Emergencies'],
      ['MSK', 'Emergencies'],
      ['Trauma', 'Emergencies'],
      ['Others', 'Emergencies']
    ];
    
    for (const [name, parent] of catalog) {
      const val = parent + ' - ' + name;
      const safeName = name.replace(/'/g, "''");
      const safeVal = val.replace(/'/g, "''");
      const safeParent = parent.replace(/'/g, "''");
      
      await db.execute(sql.raw(`
        INSERT INTO department_catalog (department_id, kind, name, value, parent_value) VALUES
        (18, 'clinical_work_subtype', '${safeName}', '${safeVal}', '${safeParent}'),
        (19, 'clinical_work_subtype', '${safeName}', '${safeVal}', '${safeParent}')
        ON CONFLICT (department_id, kind, value) DO NOTHING
      `));
    }

    console.log("Successfully ran the DB fix script.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
